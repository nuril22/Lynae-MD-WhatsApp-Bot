import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { isOwner } from '../config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const handler = async (m, { lynae, usedPrefix }) => {
    const chatId = m.chat || m.sender
    
    // Debug: log command execution
    console.log('[SF Command] Command triggered:', m.text)
    console.log('[SF Command] Command text:', m.text)
    console.log('[SF Command] Quoted:', !!m.quoted)
    
    // Check if user is owner
    if (!isOwner(m.sender)) {
        await lynae.sendMessage(chatId, {
            text: `❌ This command is only available for bot owners.`
        })
        return
    }
    
    // Check if there's a quoted message
    if (!m.quoted) {
        await lynae.sendMessage(chatId, {
            text: `❌ Please reply to a message containing the script code.\n\nUsage: ${usedPrefix}sf <filename>.js\n\nExample:\n1. Send your script code to chat\n2. Reply to that message\n3. Type: ${usedPrefix}sf mycommand.js`
        })
        return
    }
    
    // Get filename from command
    const args = m.text.split(' ').slice(1)
    const filename = args[0]
    
    if (!filename) {
        await lynae.sendMessage(chatId, {
            text: `❌ Please specify a filename.\n\nUsage: ${usedPrefix}sf <filename>.js\n\nExample: ${usedPrefix}sf mycommand.js`
        })
        return
    }
    
    // Validate filename
    if (!filename.endsWith('.js')) {
        await lynae.sendMessage(chatId, {
            text: `❌ Filename must end with .js extension.\n\nExample: ${usedPrefix}sf mycommand.js`
        })
        return
    }
    
    // Check if filename contains invalid characters
    if (!/^[a-zA-Z0-9_-]+\.js$/.test(filename)) {
        await lynae.sendMessage(chatId, {
            text: `❌ Invalid filename. Only letters, numbers, underscores, and hyphens are allowed.\n\nExample: ${usedPrefix}sf my_command.js`
        })
        return
    }
    
    // Prevent overwriting index.js
    if (filename === 'index.js') {
        await lynae.sendMessage(chatId, {
            text: `❌ Cannot overwrite index.js. Please use a different filename.`
        })
        return
    }
    
    // Prevent overwriting sf.js itself
    if (filename === 'sf.js') {
        await lynae.sendMessage(chatId, {
            text: `❌ Cannot overwrite sf.js. Please use a different filename.`
        })
        return
    }
    
    try {
        // Get quoted message content
        let scriptContent = ''
        
        // Method 1: Use quotedText from handler.js (most reliable)
        if (m.quotedText && m.quotedText.trim()) {
            scriptContent = m.quotedText
        }
        
        // Method 2: Try to get from quoted contextInfo (if handler.js provides it)
        if (!scriptContent && m.quoted && m.quoted.contextInfo) {
            const quotedMsg = m.quoted.contextInfo.quotedMessage
            if (quotedMsg) {
                if (quotedMsg.conversation) {
                    scriptContent = quotedMsg.conversation
                } else if (quotedMsg.extendedTextMessage?.text) {
                    scriptContent = quotedMsg.extendedTextMessage.text
                } else if (quotedMsg.imageMessage?.caption) {
                    scriptContent = quotedMsg.imageMessage.caption
                } else if (quotedMsg.videoMessage?.caption) {
                    scriptContent = quotedMsg.videoMessage.caption
                }
            }
        }
        
        // Method 3: Try to fetch message using loadMessage (if available)
        // Note: loadMessage might not be available in all Baileys versions
        if (!scriptContent && m.quoted && m.quoted.key) {
            try {
                const quotedKey = m.quoted.key
                // Try to get message from the original message structure
                if (quotedKey.id) {
                    // Check if loadMessage method exists on the socket
                    // We need to access the original socket, not the proxy
                    const originalSocket = lynae.constructor?.name === 'Proxy' 
                        ? lynae._target || lynae 
                        : lynae
                    
                    if (typeof originalSocket.loadMessage === 'function') {
                        const targetJid = quotedKey.remoteJid || m.chat
                        const fullMessage = await originalSocket.loadMessage(targetJid, quotedKey.id)
                        
                        if (fullMessage?.message) {
                            if (fullMessage.message.conversation) {
                                scriptContent = fullMessage.message.conversation
                            } else if (fullMessage.message.extendedTextMessage?.text) {
                                scriptContent = fullMessage.message.extendedTextMessage.text
                            } else if (fullMessage.message.imageMessage?.caption) {
                                scriptContent = fullMessage.message.imageMessage.caption
                            } else if (fullMessage.message.videoMessage?.caption) {
                                scriptContent = fullMessage.message.videoMessage.caption
                            }
                        }
                    }
                }
            } catch (fetchError) {
                // If loadMessage fails, continue to next method
                console.error('Error fetching quoted message with loadMessage:', fetchError.message)
            }
        }
        
        // If still no content, show error with helpful message
        if (!scriptContent || scriptContent.trim() === '') {
            await lynae.sendMessage(chatId, {
                text: `❌ Could not extract script content from quoted message.\n\nPlease make sure:\n- You're replying to a text message (not image/video)\n- The message contains script code\n- The message is recent (not too old)\n\nTry this:\n1. Send your script code as a text message\n2. Reply to that message\n3. Type: ${usedPrefix}sf ${filename}`
            })
            return
        }
        
        // Get plugins directory path
        const pluginsDir = __dirname
        const filePath = path.join(pluginsDir, filename)
        
        // Check if file already exists
        if (fs.existsSync(filePath)) {
            await lynae.sendMessage(chatId, {
                text: `⚠️ File ${filename} already exists. It will be overwritten.`
            })
        }
        
        // Write file
        fs.writeFileSync(filePath, scriptContent, 'utf8')
        
        // Validate the file was written correctly
        if (!fs.existsSync(filePath)) {
            await lynae.sendMessage(chatId, {
                text: `❌ Failed to save file. Please check file permissions.`
            })
            return
        }
        
        // Success message
        await lynae.sendMessage(chatId, {
            text: `✅ Script saved successfully!\n\n📁 File: ${filename}\n📂 Location: plugins/${filename}\n\n🔄 Plugin will be automatically reloaded (hot-reload enabled)`
        })
        
        // Trigger hot-reload if available
        try {
            const { reloadPlugin } = await import('../plugins/index.js')
            if (typeof reloadPlugin === 'function') {
                await reloadPlugin(filename)
            }
        } catch (reloadError) {
            // Ignore reload errors - file is already saved
            console.log('Note: Could not auto-reload plugin, but file was saved')
        }
        
    } catch (error) {
        console.error('Error saving script:', error)
        await lynae.sendMessage(chatId, {
            text: `❌ Error saving script: ${error.message}\n\nPlease check:\n- File permissions\n- Disk space\n- Valid JavaScript syntax`
        })
    }
}

handler.help = ['sf <filename>.js']
handler.tags = ['owner']
// Match "sf" at start, optionally followed by space and arguments
handler.command = /^sf(\s|$)/
handler.description = 'Save a script from quoted message to plugins folder (Owner only)'

export default handler

