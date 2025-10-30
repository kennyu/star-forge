import { app, BrowserWindow, ipcMain, dialog, desktopCapturer } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import ffprobeStatic from 'ffprobe-static'
import fs from 'fs'
import { promisify } from 'util'

const writeFileAsync = promisify(fs.writeFile)

let mainWindow: BrowserWindow | null = null
let currentFFmpegProcess: ChildProcess | null = null

// Helper function to get correct binary path for production builds
function getBinaryPath(originalPath: string): string {
  // In development, use the original path
  if (process.env.VITE_DEV_SERVER_URL) {
    return originalPath
  }
  
  // In production, binaries are unpacked from ASAR
  // Replace app.asar with app.asar.unpacked
  if (originalPath.includes('app.asar')) {
    return originalPath.replace('app.asar', 'app.asar.unpacked')
  }
  
  return originalPath
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Needed for loading local video files
    },
  })

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// IPC Handlers for file operations
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return result.filePaths
})

ipcMain.handle('dialog:saveFile', async (_, defaultPath: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: [
      { name: 'Video', extensions: ['mp4'] }
    ]
  })
  return result.filePath
})

// Get video metadata using FFprobe
ipcMain.handle('ffmpeg:getMetadata', async (_, filePath: string) => {
  return new Promise((resolve, reject) => {
    const ffprobePath = getBinaryPath(ffprobeStatic.path)
    console.log('[FFprobe] Analyzing file:', filePath)
    console.log('[FFprobe] Using binary at:', ffprobePath)
    
    const ffprobe = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'stream=width,height,duration,r_frame_rate,nb_frames,pix_fmt,codec_type',
      '-show_entries', 'format=duration,size,bit_rate',
      '-of', 'json',
      filePath
    ])

    let output = ''
    let errorOutput = ''

    ffprobe.stdout.on('data', (data) => {
      output += data.toString()
    })

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        console.error('[FFprobe] Failed with code:', code, 'Error:', errorOutput)
        reject(new Error(`FFprobe failed: ${errorOutput}`))
        return
      }

      try {
        console.log('[FFprobe] Raw output:', output)
        const data = JSON.parse(output)
        console.log('[FFprobe] Parsed data:', JSON.stringify(data, null, 2))
        
        const stats = fs.statSync(filePath)
        const fileName = path.basename(filePath)
        
        // Find video and audio streams
        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video')
        const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio')
        
        // Extract duration
        const formatDuration = data.format?.duration
        const streamDuration = videoStream?.duration
        console.log('[FFprobe] Duration sources - format:', formatDuration, 'stream:', streamDuration)
        
        let duration = parseFloat(formatDuration || streamDuration || 0)
        
        // Quick fallback: Calculate from frame count and frame rate if available
        if ((duration === 0 || isNaN(duration)) && videoStream?.nb_frames && videoStream?.r_frame_rate) {
          console.log('[FFprobe] Duration is 0/NaN, trying frame count calculation...')
          const nbFrames = parseInt(videoStream.nb_frames)
          const frameRate = videoStream.r_frame_rate
          
          // Parse frame rate (e.g., "30/1" or "30000/1001")
          const [num, den] = frameRate.split('/').map(Number)
          if (num && den && nbFrames > 0) {
            const fps = num / den
            duration = nbFrames / fps
            console.log('[FFprobe] Calculated duration from frames:', nbFrames, 'frames at', fps.toFixed(2), 'fps =', duration.toFixed(2), 'seconds')
          }
        }
        
        // If still 0, the renderer will use HTML5 video element as fallback (faster than counting frames)
        if (duration === 0 || isNaN(duration)) {
          console.log('[FFprobe] Duration unavailable in metadata, will use HTML5 video element fallback in renderer')
        }
        
        console.log('[FFprobe] Final duration value:', duration)
        
        // Extract FPS
        let fps = 30 // default
        if (videoStream?.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number)
          if (num && den) {
            fps = num / den
          }
        }
        
        const metadata = {
          name: fileName,
          duration: duration,
          resolution: {
            width: videoStream?.width || 0,
            height: videoStream?.height || 0
          },
          size: parseInt(data.format?.size || stats.size),
          type: path.extname(filePath).slice(1).toUpperCase(),
          fps: fps,
          pixelFormat: videoStream?.pix_fmt || 'yuv420p',
          hasAudio: !!audioStream
        }

        console.log('[FFprobe] Final metadata:', JSON.stringify(metadata, null, 2))
        resolve(metadata)
      } catch (error) {
        console.error('[FFprobe] Error parsing metadata:', error)
        reject(error)
      }
    })
  })
})

// Export video with FFmpeg
ipcMain.handle('ffmpeg:export', async (event, options: {
  inputPath: string,
  outputPath: string,
  quality: '720p' | '1080p' | 'source',
  duration: number
}) => {
  return new Promise((resolve, reject) => {
    const { inputPath, outputPath, quality, duration } = options

    console.log('[FFmpeg Export] Starting single clip export')
    console.log('[FFmpeg Export] Input:', inputPath)
    console.log('[FFmpeg Export] Output:', outputPath)
    console.log('[FFmpeg Export] Quality:', quality)
    console.log('[FFmpeg Export] Duration:', duration)
    
    // Check if output file is same as input file
    const normalizedInput = path.normalize(inputPath.toLowerCase())
    const normalizedOutput = path.normalize(outputPath.toLowerCase())
    
    if (normalizedInput === normalizedOutput) {
      console.error('[FFmpeg Export] Output file conflicts with input file')
      reject(new Error('Cannot export: Output filename is the same as the input file. Please choose a different filename.'))
      return
    }

    // Build FFmpeg arguments based on quality
    const args = [
      '-i', inputPath,
      '-c:v', 'libx264',  // H.264 codec
      '-preset', 'medium', // Encoding speed/quality balance
      '-c:a', 'aac',       // AAC audio codec
      '-b:a', '192k',      // Audio bitrate
      '-movflags', '+faststart', // Web optimization
    ]

    // Add resolution/quality settings
    if (quality === '720p') {
      args.push('-vf', 'scale=-2:720', '-b:v', '2500k')
    } else if (quality === '1080p') {
      args.push('-vf', 'scale=-2:1080', '-b:v', '5000k')
    } else {
      // Source quality - copy if possible, or use high quality
      args.push('-b:v', '8000k')
    }

    args.push('-y', outputPath) // Overwrite output file

    const ffmpegPath = getBinaryPath(ffmpeg.path)
    console.log('[FFmpeg Export] Command:', ffmpegPath, args.join(' '))

    const ffmpegProcess = spawn(ffmpegPath, args)
    currentFFmpegProcess = ffmpegProcess

    let errorOutput = ''

    // Parse progress from FFmpeg stderr
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString()
      errorOutput += output

      // Extract time progress (format: time=00:00:10.00)
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
      if (timeMatch && duration > 0) {
        const hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        const seconds = parseFloat(timeMatch[3])
        const currentTime = hours * 3600 + minutes * 60 + seconds
        const progress = Math.min((currentTime / duration) * 100, 100)
        
        // Send progress to renderer
        event.sender.send('export:progress', progress)
      }
    })

    ffmpegProcess.on('close', (code) => {
      currentFFmpegProcess = null
      
      console.log('[FFmpeg Export] Process closed with code:', code)
      
      if (code !== 0) {
        console.error('[FFmpeg Export] Export failed with error output:', errorOutput)
        reject(new Error(`FFmpeg export failed (exit code ${code}): ${errorOutput}`))
        return
      }

      console.log('[FFmpeg Export] Export successful!')
      // Send 100% progress
      event.sender.send('export:progress', 100)
      resolve({ success: true, outputPath })
    })

    ffmpegProcess.on('error', (error) => {
      currentFFmpegProcess = null
      console.error('[FFmpeg Export] Process error:', error)
      reject(new Error(`FFmpeg process error: ${error.message}`))
    })
  })
})

// Cancel export
ipcMain.handle('ffmpeg:cancel', async () => {
  if (currentFFmpegProcess) {
    currentFFmpegProcess.kill('SIGTERM')
    currentFFmpegProcess = null
    return { success: true }
  }
  return { success: false, message: 'No active export process' }
})

// Helper function to get target dimensions based on quality setting
function getTargetDimensions(quality: '720p' | '1080p' | 'source', sourceFiles: string[]): { width: number, height: number } {
  if (quality === '720p') {
    return { width: 1280, height: 720 }
  }
  if (quality === '1080p') {
    return { width: 1920, height: 1080 }
  }
  
  // For 'source' quality, we'll use 1080p as default
  // In a real implementation, you'd analyze all source files to find max resolution
  return { width: 1920, height: 1080 }
}

// Export timeline with multiple clips
ipcMain.handle('ffmpeg:exportTimeline', async (event, options: {
  clips: Array<{
    sourceFilePath: string,
    trimStart: number,
    trimEnd: number,
    duration: number
  }>,
  outputPath: string,
  quality: '720p' | '1080p' | 'source',
  totalDuration: number
}) => {
  return new Promise(async (resolve, reject) => {
    const { clips, outputPath, quality, totalDuration } = options

    // Build list of unique input files
    const uniqueFiles = Array.from(new Set(clips.map(c => c.sourceFilePath)))
    
    console.log('[FFmpeg Timeline] Starting timeline export')
    console.log('[FFmpeg Timeline] Unique input files:', uniqueFiles.length)
    console.log('[FFmpeg Timeline] Total clips:', clips.length)
    console.log('[FFmpeg Timeline] Quality:', quality)
    
    // Check if output file is same as any input file
    const normalizedOutput = path.normalize(outputPath.toLowerCase())
    const conflictingInput = uniqueFiles.find(inputFile => 
      path.normalize(inputFile.toLowerCase()) === normalizedOutput
    )
    
    if (conflictingInput) {
      console.error('[FFmpeg Timeline] Output file conflicts with input file:', {
        output: outputPath,
        input: conflictingInput
      })
      reject(new Error('Cannot export: Output filename matches one of the input clips. Please choose a different filename or remove the conflicting clip from the timeline.'))
      return
    }
    
    // Get metadata for each unique file to check for audio streams
    const fileMetadata = new Map<string, { hasAudio: boolean }>()
    
    try {
      for (const filePath of uniqueFiles) {
        console.log('[FFmpeg Timeline] Analyzing file:', filePath)
        
        // Quick probe for audio stream only
        const metadata = await new Promise<{ hasAudio: boolean }>((resolveProbe, rejectProbe) => {
          const ffprobePath = getBinaryPath(ffprobeStatic.path)
          const ffprobe = spawn(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'stream=codec_type',
            '-of', 'json',
            filePath
          ])

          let output = ''
          ffprobe.stdout.on('data', (data) => { output += data.toString() })
          ffprobe.on('close', (code) => {
            if (code !== 0) {
              console.warn('[FFmpeg Timeline] FFprobe failed for', filePath, '- assuming no audio')
              resolveProbe({ hasAudio: false })
              return
            }
            
            try {
              const data = JSON.parse(output)
              const hasAudio = data.streams?.some((s: any) => s.codec_type === 'audio') || false
              console.log('[FFmpeg Timeline] File', path.basename(filePath), 'has audio:', hasAudio)
              resolveProbe({ hasAudio })
            } catch (error) {
              console.warn('[FFmpeg Timeline] Failed to parse probe result - assuming no audio')
              resolveProbe({ hasAudio: false })
            }
          })
        })
        
        fileMetadata.set(filePath, metadata)
      }
    } catch (error) {
      console.error('[FFmpeg Timeline] Failed to analyze input files:', error)
      reject(new Error('Failed to analyze input files'))
      return
    }
    
    // Determine target dimensions and frame rate
    const targetDims = getTargetDimensions(quality, uniqueFiles)
    const targetFps = 30 // Standard frame rate
    
    console.log('[FFmpeg Timeline] Target dimensions:', targetDims)
    console.log('[FFmpeg Timeline] Target FPS:', targetFps)
    
    // Build filter_complex string with normalization
    let filterParts: string[] = []
    
    clips.forEach((clip, clipIndex) => {
      const inputIndex = uniqueFiles.indexOf(clip.sourceFilePath)
      const metadata = fileMetadata.get(clip.sourceFilePath)!
      
      // Video processing: trim → scale with aspect ratio preservation → pad → fps normalize → pixel format
      filterParts.push(
        `[${inputIndex}:v]trim=start=${clip.trimStart}:end=${clip.trimEnd},setpts=PTS-STARTPTS,` +
        `scale=${targetDims.width}:${targetDims.height}:force_original_aspect_ratio=decrease,` +
        `pad=${targetDims.width}:${targetDims.height}:(ow-iw)/2:(oh-ih)/2,` +
        `fps=${targetFps},setsar=1,format=yuv420p[v${clipIndex}]`
      )
      
      // Audio processing: either use existing audio or generate silent audio
      if (metadata.hasAudio) {
        filterParts.push(
          `[${inputIndex}:a]atrim=start=${clip.trimStart}:end=${clip.trimEnd},` +
          `asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[a${clipIndex}]`
        )
      } else {
        // Generate silent audio for video-only files
        filterParts.push(
          `anullsrc=channel_layout=stereo:sample_rate=48000,` +
          `atrim=duration=${clip.duration}[a${clipIndex}]`
        )
      }
    })
    
    // Build concat inputs - must be interleaved: [v0][a0][v1][a1]...
    const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join('')
    
    // Concat filter - no additional processing needed since clips are already normalized
    filterParts.push(
      `${concatInputs}concat=n=${clips.length}:v=1:a=1[vout][aout]`
    )
    
    const filterComplex = filterParts.join(';')
    
    // Build FFmpeg arguments
    const args: string[] = []
    
    // Add all input files
    uniqueFiles.forEach(file => {
      args.push('-i', file)
    })
    
    // Add filter complex
    args.push('-filter_complex', filterComplex)
    
    // Map outputs
    args.push('-map', '[vout]', '-map', '[aout]')
    
    // Encoding settings
    args.push('-c:v', 'libx264', '-preset', 'medium')
    args.push('-c:a', 'aac', '-b:a', '192k')
    args.push('-movflags', '+faststart')
    
    // Quality settings (bitrate)
    if (quality === '720p') {
      args.push('-b:v', '2500k')
    } else if (quality === '1080p') {
      args.push('-b:v', '5000k')
    } else {
      args.push('-b:v', '8000k')
    }
    
    args.push('-y', outputPath)
    
    const ffmpegPath = getBinaryPath(ffmpeg.path)
    console.log('[FFmpeg Timeline] Command:', ffmpegPath)
    console.log('[FFmpeg Timeline] Args:', args.join(' '))
    console.log('[FFmpeg Timeline] Filter complex:', filterComplex)
    
    const ffmpegProcess = spawn(ffmpegPath, args)
    currentFFmpegProcess = ffmpegProcess
    
    let errorOutput = ''
    
    // Parse progress
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString()
      errorOutput += output
      
      // Log first few lines for debugging
      if (errorOutput.length < 2000) {
        console.log('[FFmpeg Timeline] stderr:', output)
      }
      
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
      if (timeMatch && totalDuration > 0) {
        const hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        const seconds = parseFloat(timeMatch[3])
        const currentTime = hours * 3600 + minutes * 60 + seconds
        const progress = Math.min((currentTime / totalDuration) * 100, 100)
        
        event.sender.send('export:progress', progress)
      }
    })
    
    ffmpegProcess.on('close', (code) => {
      currentFFmpegProcess = null
      
      console.log('[FFmpeg Timeline] Process closed with code:', code)
      
      if (code !== 0) {
        console.error('[FFmpeg Timeline] Export failed with error output:', errorOutput)
        reject(new Error(`Timeline export failed (exit code ${code}): ${errorOutput.slice(0, 1000)}`))
        return
      }
      
      console.log('[FFmpeg Timeline] Export successful!')
      event.sender.send('export:progress', 100)
      resolve({ success: true, outputPath })
    })
    
    ffmpegProcess.on('error', (error) => {
      currentFFmpegProcess = null
      console.error('[FFmpeg Timeline] Process error:', error)
      reject(new Error(`FFmpeg process error: ${error.message}`))
    })
  })
})

// Recording IPC Handlers

// Get available screen and window sources for recording
ipcMain.handle('recording:getSources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 300, height: 200 }
    })

    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }))
  } catch (error: any) {
    console.error('[Recording] Failed to get sources:', error)
    throw new Error(`Failed to get screen sources: ${error.message}`)
  }
})

// Save recording blob to file
ipcMain.handle('recording:saveRecording', async (_, options: {
  buffer: Buffer,
  filename: string
}) => {
  try {
    const { buffer, filename } = options
    
    // Get the same directory as exports (user's last save location or documents)
    const defaultPath = path.join(app.getPath('videos'), filename)
    
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [
        { name: 'Video (WebM)', extensions: ['webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePath
    
    console.log('[Recording] Saving recording to:', filePath)
    
    // Write the buffer directly to file
    await writeFileAsync(filePath, buffer)
    
    console.log('[Recording] Recording saved successfully')
    
    // Get metadata using ffprobe
    const metadata = await new Promise((resolve, reject) => {
      const ffprobePath = getBinaryPath(ffprobeStatic.path)
      const ffprobe = spawn(ffprobePath, [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration',
        '-show_entries', 'format=duration,size',
        '-of', 'json',
        filePath
      ])

      let output = ''
      let errorOutput = ''

      ffprobe.stdout.on('data', (data) => {
        output += data.toString()
      })

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          console.warn('[Recording] FFprobe failed, using fallback metadata')
          // Return fallback metadata
          resolve({
            name: path.basename(filePath),
            duration: 0,
            resolution: { width: 1920, height: 1080 },
            size: buffer.length,
            type: path.extname(filePath).slice(1).toUpperCase()
          })
          return
        }

        try {
          const data = JSON.parse(output)
          const stats = fs.statSync(filePath)
          
          resolve({
            name: path.basename(filePath),
            duration: parseFloat(data.format?.duration || data.streams?.[0]?.duration || 0),
            resolution: {
              width: data.streams?.[0]?.width || 1920,
              height: data.streams?.[0]?.height || 1080
            },
            size: parseInt(data.format?.size || stats.size),
            type: path.extname(filePath).slice(1).toUpperCase()
          })
        } catch (error) {
          console.warn('[Recording] Failed to parse metadata, using fallback')
          resolve({
            name: path.basename(filePath),
            duration: 0,
            resolution: { width: 1920, height: 1080 },
            size: buffer.length,
            type: path.extname(filePath).slice(1).toUpperCase()
          })
        }
      })
    })

    return {
      success: true,
      filePath,
      metadata
    }
  } catch (error: any) {
    console.error('[Recording] Failed to save recording:', error)
    throw new Error(`Failed to save recording: ${error.message}`)
  }
})

