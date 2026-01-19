import { writeFile, unlink } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import path from 'path'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const handler = async (m, { lynae, usedPrefix }) => {
    try {
        const chatId = m.chat || m.sender

        // Check if video is available (from handler.js)
        let videoMessage = m.video

        // Fallback: Check quoted message manually if not found in m.video
        if (!videoMessage && m.quoted) {
            const quotedMsg = m.quoted.contextInfo?.quotedMessage
            if (quotedMsg) {
                if (quotedMsg.videoMessage) videoMessage = quotedMsg.videoMessage
                else if (quotedMsg.viewOnceMessage?.message?.videoMessage) videoMessage = quotedMsg.viewOnceMessage.message.videoMessage
                else if (quotedMsg.viewOnceMessageV2?.message?.videoMessage) videoMessage = quotedMsg.viewOnceMessageV2.message.videoMessage
            }
        }

        if (!videoMessage) {
            await lynae.sendMessage(chatId, { 
                text: `❌ *Video to MP3*\n\nPlease send a video with caption *${usedPrefix}tomp3* or reply to a video.` 
            }, { quoted: m })
            return
        }

        await lynae.sendPresenceUpdate('composing', chatId)

        const tempDir = path.join(__dirname, '..', 'temp')
        if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true })
        }

        const timestamp = Date.now()
        const inputPath = path.join(tempDir, `input_${timestamp}.mp4`)
        const outputPath = path.join(tempDir, `output_${timestamp}.mp3`)

        try {
            // Download video
            const buffer = await downloadMediaMessage(
                { message: { videoMessage: videoMessage } },
                'buffer',
                {},
                { logger: console }
            )

            await writeFile(inputPath, buffer)

            // Convert using ffmpeg
            // -vn: disable video, -acodec libmp3lame: use mp3 codec, -b:a 128k: bitrate
            await execAsync(`ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -b:a 128k "${outputPath}"`)

            // Check if output exists
            if (!existsSync(outputPath)) {
                throw new Error('Conversion failed, output file not found.')
            }

            const audioBuffer = readFileSync(outputPath)

            // Send audio
            await lynae.sendMessage(chatId, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false // Send as audio file (false) or voice note (true)
            }, { quoted: m })

        } catch (error) {
            console.error('Error converting video:', error)
            await lynae.sendMessage(chatId, { text: `❌ Error: ${error.message}` }, { quoted: m })
        } finally {
            // Cleanup temp files
            if (existsSync(inputPath)) await unlink(inputPath).catch(() => {})
            if (existsSync(outputPath)) await unlink(outputPath).catch(() => {})
        }

    } catch (error) {
        console.error('Handler error:', error)
    }
}

handler.help = ['tomp3']
handler.tags = ['tools']
handler.command = /^(tomp3|mp3)$/i
handler.description = 'Convert video to MP3 audio'

export default handler