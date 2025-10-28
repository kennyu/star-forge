import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import ffprobeStatic from 'ffprobe-static'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null
let currentFFmpegProcess: ChildProcess | null = null

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
    const ffprobe = spawn(ffprobeStatic.path, [
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
        reject(new Error(`FFprobe failed: ${errorOutput}`))
        return
      }

      try {
        const data = JSON.parse(output)
        const stats = fs.statSync(filePath)
        const fileName = path.basename(filePath)
        
        const metadata = {
          name: fileName,
          duration: parseFloat(data.format?.duration || data.streams?.[0]?.duration || 0),
          resolution: {
            width: data.streams?.[0]?.width || 0,
            height: data.streams?.[0]?.height || 0
          },
          size: parseInt(data.format?.size || stats.size),
          type: path.extname(filePath).slice(1).toUpperCase()
        }

        resolve(metadata)
      } catch (error) {
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

    console.log('[FFmpeg Export] Command:', ffmpeg.path, args.join(' '))

    const ffmpegProcess = spawn(ffmpeg.path, args)
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
  return new Promise((resolve, reject) => {
    const { clips, outputPath, quality, totalDuration } = options

    // Build list of unique input files
    const uniqueFiles = Array.from(new Set(clips.map(c => c.sourceFilePath)))
    
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
    
    // Build filter_complex string
    let filterParts: string[] = []
    
    clips.forEach((clip, clipIndex) => {
      const inputIndex = uniqueFiles.indexOf(clip.sourceFilePath)
      
      // Trim video and audio for this clip
      const videoLabel = `v${clipIndex}`
      const audioLabel = `a${clipIndex}`
      
      filterParts.push(
        `[${inputIndex}:v]trim=start=${clip.trimStart}:end=${clip.trimEnd},setpts=PTS-STARTPTS[${videoLabel}]`
      )
      filterParts.push(
        `[${inputIndex}:a]atrim=start=${clip.trimStart}:end=${clip.trimEnd},asetpts=PTS-STARTPTS[${audioLabel}]`
      )
    })
    
    // Build concat inputs - must be interleaved: [v0][a0][v1][a1]...
    const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join('')
    
    // Concat filter
    filterParts.push(
      `${concatInputs}concat=n=${clips.length}:v=1:a=1[vtmp][aout]`
    )
    
    // Apply scaling to concatenated video (if needed)
    if (quality === '720p') {
      filterParts.push('[vtmp]scale=-2:720[vout]')
    } else if (quality === '1080p') {
      filterParts.push('[vtmp]scale=-2:1080[vout]')
    } else {
      // No scaling for source quality - just pass through
      filterParts.push('[vtmp]null[vout]')
    }
    
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
    
    // Quality settings (bitrate only, scaling is in filter_complex)
    if (quality === '720p') {
      args.push('-b:v', '2500k')
    } else if (quality === '1080p') {
      args.push('-b:v', '5000k')
    } else {
      args.push('-b:v', '8000k')
    }
    
    args.push('-y', outputPath)
    
    console.log('[FFmpeg Timeline] Command:', ffmpeg.path)
    console.log('[FFmpeg Timeline] Args:', args.join(' '))
    console.log('[FFmpeg Timeline] Filter complex:', filterComplex)
    
    const ffmpegProcess = spawn(ffmpeg.path, args)
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

