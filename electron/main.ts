import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { spawn } from 'child_process'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import ffprobeStatic from 'ffprobe-static'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null

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

    const ffmpegProcess = spawn(ffmpeg.path, args)

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
      if (code !== 0) {
        reject(new Error(`FFmpeg export failed: ${errorOutput}`))
        return
      }

      // Send 100% progress
      event.sender.send('export:progress', 100)
      resolve({ success: true, outputPath })
    })

    ffmpegProcess.on('error', (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`))
    })
  })
})

