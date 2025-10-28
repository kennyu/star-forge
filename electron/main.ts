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

