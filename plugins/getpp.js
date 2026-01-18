import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const handler = async (m, { lynae, usedPrefix }) => {
    // Define chatId outside try block so it's accessible in catch block
    const chatId = m.chat || m.sender || m.key?.remoteJid
    
    try {
        // Helper to check if JID is a group
        const isGroup = (jid) => jid && jid.includes('@g.us')
        
        // Helper to get user JID (not group)
        const getUserJid = (jid) => {
            if (!jid) return null
            // If it's a group JID, we can't use it directly
            if (isGroup(jid)) return null
            // If it's already a user JID, return it
            if (jid.includes('@s.whatsapp.net')) return jid
            // If it's just a number, add @s.whatsapp.net
            if (/^\d+$/.test(jid)) return jid + '@s.whatsapp.net'
            return null
        }
        
        // Get mentioned user or use sender
        // Default: use sender (user's own profile picture)
        let targetJid = m.sender
        
        // Ensure sender is a valid user JID (not group)
        if (!m.sender || isGroup(m.sender) || !m.sender.includes('@s.whatsapp.net')) {
            await lynae.sendMessage(chatId, { 
                text: `❌ Cannot determine user. Please use this command in private chat or mention a user.` 
            })
            return
        }
        
        // Priority 1: Check if there's a quoted message (reply)
        // Quoted message info is in m.quoted (from handler.js)
        if (m.quoted) {
            // Get participant from quoted message (this is the user who sent the quoted message)
            const quotedParticipant = m.quoted.participant || m.quoted.key?.participant
            
            if (quotedParticipant) {
                const userJid = getUserJid(quotedParticipant)
                if (userJid && !isGroup(userJid)) {
                    targetJid = userJid
                }
            } else if (m.quoted.key?.remoteJid && !isGroup(m.quoted.key.remoteJid)) {
                // If no participant but remoteJid is user JID (private chat)
                targetJid = m.quoted.key.remoteJid
            }
        }
        
        // Priority 2: Check for mentions in current message
        if (targetJid === m.sender) {
            // Check mentions array first (from extendedTextMessage.contextInfo.mentionedJid)
            if (m.mentions && Array.isArray(m.mentions) && m.mentions.length > 0) {
                // Use first mentioned user
                const mentionedJid = m.mentions[0]
                const userJid = getUserJid(mentionedJid)
                if (userJid && !isGroup(userJid)) {
                    targetJid = userJid
                }
            }
            
            // If still no mention found, try parsing from text
            if (targetJid === m.sender) {
                const text = m.text || m.body || ''
                // Try regex match for @number format
                const mentionMatch = text.match(/@(\d+)/)
                if (mentionMatch) {
                    const userJid = getUserJid(mentionMatch[1])
                    if (userJid && !isGroup(userJid)) {
                        targetJid = userJid
                    }
                }
            }
        }
        
        // Final validation - ensure it's a user JID, not group
        if (!targetJid || isGroup(targetJid) || !targetJid.includes('@s.whatsapp.net')) {
            targetJid = m.sender
        }
        
        // Start typing indicator
        await lynae.sendPresenceUpdate('composing', chatId)
        await new Promise(resolve => setTimeout(resolve, 1000))
        await lynae.sendPresenceUpdate('available', chatId)
        
        // Get profile picture - try different methods
        let imageBuffer = null
        
        try {
            // Method 1: Try profilePictureUrl (may return object or URL)
            let profilePicUrl = await lynae.profilePictureUrl(targetJid, 'image')
            
            // Handle different return types
            let profilePicUrlString = null
            if (typeof profilePicUrl === 'string') {
                profilePicUrlString = profilePicUrl
            } else if (profilePicUrl && typeof profilePicUrl === 'object') {
                // Try to get URL from object properties
                profilePicUrlString = profilePicUrl.eurl || profilePicUrl.url || profilePicUrl.link
                
                // If still no URL, try using the id to construct URL
                if (!profilePicUrlString && profilePicUrl.id) {
                    // WhatsApp profile picture URL format
                    profilePicUrlString = `https://pps.whatsapp.net/v/t61.24694-24/${profilePicUrl.id}_0.jpg?ccb=11-4&oh=${Date.now()}&oe=${Date.now()}`
                }
            }
            
            // If we have a valid URL, download it
            if (profilePicUrlString && (profilePicUrlString.startsWith('http://') || profilePicUrlString.startsWith('https://'))) {
                try {
                    const response = await axios.get(profilePicUrlString, { 
                        responseType: 'arraybuffer',
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    })
                    imageBuffer = Buffer.from(response.data)
                } catch (downloadError) {
                    console.error('Error downloading profile picture:', downloadError.message)
                }
            }
            
            // Method 2: If download failed, try using downloadMediaMessage or other methods
            if (!imageBuffer) {
                // Try alternative method - get profile picture using different API
                try {
                    const contact = await lynae.onWhatsApp(targetJid)
                    if (contact && contact[0]) {
                        // Try to get profile picture using contact info
                        const altUrl = await lynae.profilePictureUrl(targetJid)
                        if (altUrl && typeof altUrl === 'string' && altUrl.startsWith('http')) {
                            const response = await axios.get(altUrl, { 
                                responseType: 'arraybuffer',
                                timeout: 10000
                            })
                            imageBuffer = Buffer.from(response.data)
                        }
                    }
                } catch (altError) {
                    console.error('Alternative method failed:', altError.message)
                }
            }
            
        } catch (error) {
            console.error('Error getting profile picture:', error)
        }
        
        // If still no image, return error
        if (!imageBuffer || imageBuffer.length === 0) {
            await lynae.sendMessage(chatId, { 
                text: `❌ Profile picture not available for this user or failed to download.` 
            })
            return
        }
        
        // Create temp directory if not exists
        const tempDir = path.join(__dirname, '..', 'temp')
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
        }
        
        // Save temporary image
        const tempImagePath = path.join(tempDir, `pp_${Date.now()}.jpg`)
        fs.writeFileSync(tempImagePath, imageBuffer)
        
        // Process image with ffmpeg (optional: resize/optimize)
        const outputPath = path.join(tempDir, `pp_processed_${Date.now()}.jpg`)
        
        try {
            // Use ffmpeg to process image (resize to max 512x512 while maintaining aspect ratio)
            await execAsync(`ffmpeg -i "${tempImagePath}" -vf "scale=512:512:force_original_aspect_ratio=decrease" -y "${outputPath}"`)
            
            // Read processed image
            const processedImage = fs.readFileSync(outputPath)
            
            // Get user info
            const contact = await lynae.onWhatsApp(targetJid)
            const username = contact?.[0]?.name || targetJid.split('@')[0]
            
            // Send image
            await lynae.sendMessage(chatId, {
                image: processedImage,
                caption: `📷 *Profile Picture*\n\n👤 *User:* ${username}\n📱 *JID:* ${targetJid.split('@')[0]}`
            })
            
            // Clean up temp files
            try {
                if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath)
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
            } catch (e) {}
            
        } catch (ffmpegError) {
            // If ffmpeg fails, send original image
            const contact = await lynae.onWhatsApp(targetJid)
            const username = contact?.[0]?.name || targetJid.split('@')[0]
            
            await lynae.sendMessage(chatId, {
                image: imageBuffer,
                caption: `📷 *Profile Picture*\n\n👤 *User:* ${username}\n📱 *JID:* ${targetJid.split('@')[0]}`
            })
            
            // Clean up temp file
            try {
                if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath)
            } catch (e) {}
        }
        
    } catch (error) {
        console.error('Error in getpp command:', error)
        await lynae.sendMessage(chatId, { 
            text: `❌ Error getting profile picture: ${error.message}` 
        })
    }
}

handler.help = ['getpp']
handler.tags = ['tools']
handler.command = /^getpp(\s+.*)?$/i
handler.description = 'Get profile picture. Usage: .getpp (your own PP), .getpp @user (mentioned user), or reply a message and type .getpp (PP of replied user)'

export default handler

