import { writeFile, unlink } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import path from 'path'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { config } from '../config.js'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const handler = async (m, { lynae, usedPrefix }) => {
    try {
        const chatId = m.chat || m.sender || m.key?.remoteJid
        
        // Get image from message
        let imageMessage = m.image
        
        // If no image in m.image, try to get from quoted message
        if (!imageMessage && m.quoted) {
            if (m.quoted.contextInfo && m.quoted.contextInfo.quotedMessage) {
                const quotedMsg = m.quoted.contextInfo.quotedMessage
                if (quotedMsg.imageMessage) {
                    imageMessage = quotedMsg.imageMessage
                }
            } else if (m.quoted.imageMessage) {
                imageMessage = m.quoted.imageMessage
            }
        }
        
        if (!imageMessage) {
            await lynae.sendMessage(chatId, {
                text: `❌ *Sticker Maker*\n\nPlease send an image with caption *${usedPrefix}sticker* or reply to an image you want to convert to sticker.`
            })
            return
        }
        
        // Start typing indicator
        await lynae.sendPresenceUpdate('composing', chatId)
        
        // Download image
        const tempDir = path.join(__dirname, '..', 'temp')
        const timestamp = Date.now()
        const tempImagePath = path.join(tempDir, `sticker_${timestamp}.png`)
        const tempWebpPath = path.join(tempDir, `sticker_${timestamp}.webp`)
        
        try {
            // Ensure temp directory exists
            if (!existsSync(tempDir)) {
                mkdirSync(tempDir, { recursive: true })
            }
            
            // Download image using Baileys downloadMediaMessage
            let imageBuffer = null
            try {
                imageBuffer = await downloadMediaMessage(
                    { message: { imageMessage: imageMessage } },
                    'buffer',
                    {},
                    { logger: () => {} }
                )
            } catch (downloadError) {
                console.error('Error downloading image:', downloadError)
                throw new Error('Failed to download image. Please try again.')
            }
            
            if (!imageBuffer || imageBuffer.length === 0) {
                throw new Error('Downloaded image is empty.')
            }
            
            // Save image as PNG
            await writeFile(tempImagePath, imageBuffer)
            
            // Get sticker pack name and author from config
            const packName = config.sticker?.packName || 'LynaeBot'
            const packAuthor = config.sticker?.packAuthor || 'vtx.my.id'
            
            // Detect image properties using ffprobe
            let hasTransparency = false
            let imageWidth = 0
            let imageHeight = 0
            let aspectRatio = 1
            
            try {
                // Get image dimensions and pixel format
                const probeCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt -of json "${tempImagePath}"`
                const probeResult = await execAsync(probeCommand, { timeout: 5000 })
                const probeData = JSON.parse(probeResult.stdout)
                
                if (probeData.streams && probeData.streams[0]) {
                    imageWidth = probeData.streams[0].width || 0
                    imageHeight = probeData.streams[0].height || 0
                    const pixFmt = probeData.streams[0].pix_fmt || ''
                    
                    if (imageWidth && imageHeight) {
                        aspectRatio = imageWidth / imageHeight
                    }
                    
                    // Check for transparency (alpha channel)
                    hasTransparency = pixFmt.includes('a') || pixFmt === 'rgba' || pixFmt === 'yuva420p'
                }
            } catch (e) {
                console.log('Could not detect image properties, using defaults:', e.message)
            }
            
            // Check if aspect ratio is 1:1 (with tolerance)
            // Consider 1:1 if aspect ratio is between 0.95 and 1.05
            const isSquare = aspectRatio >= 0.95 && aspectRatio <= 1.05
            
            console.log('[STICKER] Image properties:', {
                width: imageWidth,
                height: imageHeight,
                aspectRatio: aspectRatio.toFixed(2),
                isSquare: isSquare,
                hasTransparency
            })
            
            // Build ffmpeg command to convert to 1:1 (No Visual Watermark)
            let ffmpegCommand = ''
            
            if (isSquare) {
                // Already 1:1, just resize to 512x512
                ffmpegCommand = `ffmpeg -i "${tempImagePath}" -vf "scale=512:512" -quality 90 -compression_level 6 -f webp -y "${tempWebpPath}"`
            } else {
                // Not 1:1, convert to 1:1 first (crop center)
                ffmpegCommand = `ffmpeg -i "${tempImagePath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -quality 90 -compression_level 6 -f webp -y "${tempWebpPath}"`
            }
            
            console.log('[STICKER] FFmpeg command:', ffmpegCommand)
            
            await execAsync(ffmpegCommand, { timeout: 30000 })
            
            // Verify webp file exists and has content
            const fs = await import('fs')
            if (!fs.existsSync(tempWebpPath)) {
                throw new Error('Failed to create WebP file.')
            }
            
            const webpBuffer = fs.readFileSync(tempWebpPath)
            if (!webpBuffer || webpBuffer.length === 0) {
                throw new Error('WebP file is empty.')
            }
            
            // Add Exif Metadata
            const webpWithExif = await addExif(webpBuffer, packName, packAuthor)
            
            // Send sticker with metadata
            await lynae.sendMessage(
                chatId,
                {
                    sticker: webpWithExif,
                    mimetype: 'image/webp'
                }
            )
            console.log('[STICKER] ✓ Sent with metadata:', { packName, packAuthor })
            
            // Clean up temp files
            try {
                await unlink(tempImagePath).catch(() => {})
                await unlink(tempWebpPath).catch(() => {})
            } catch (e) {
                // Ignore cleanup errors
            }
            
            await lynae.sendPresenceUpdate('available', chatId)
            
        } catch (error) {
            console.error('Error creating sticker:', error)
            await lynae.sendMessage(chatId, {
                text: `❌ Failed to create sticker.\n\nError: ${error.message || 'Unknown error'}\n\nPlease ensure:\n- The image is valid\n- ffmpeg is installed`
            })
            
            // Clean up temp files
            try {
                const fs = await import('fs')
                if (existsSync(tempImagePath)) await unlink(tempImagePath).catch(() => {})
                if (existsSync(tempWebpPath)) await unlink(tempWebpPath).catch(() => {})
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        
    } catch (error) {
        console.error('Error in sticker command:', error)
        const chatId = m.chat || m.sender || m.key?.remoteJid
        await lynae.sendMessage(chatId, {
            text: `❌ Error: ${error.message}`
        })
    }
}

handler.help = ['sticker', 's']
handler.tags = ['tools']
handler.command = /^(sticker|s)$/i
handler.description = 'Create sticker from image. Send an image with caption .sticker or reply to an image you want to convert to sticker'

export default handler

async function addExif(webpBuffer, packname, author) {
    const json = {
        "sticker-pack-id": "com.snowcorp.stickerly.android.stickercontentprovider b5e7275f-f1de-4137-961f-57becfad34f2",
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        "emojis": [""]
    }
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const jsonBuffer = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuffer])
    exif.writeUIntLE(jsonBuffer.length, 14, 4)

    try {
        const webpModule = await import('node-webpmux')
        const Image = webpModule.default?.Image || webpModule.Image
        const img = new Image()
        await img.load(webpBuffer)
        img.exif = exif
        return await img.save(null)
    } catch (e) {
        console.error('[STICKER] ⚠️ Gagal menambahkan metadata. Pastikan "node-webpmux" terinstall.\nError:', e.message)
        return webpBuffer
    }
}
