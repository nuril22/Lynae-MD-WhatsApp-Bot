// Import Modules (ESM)
import chalk from 'chalk'
import pluginsModule, { reloadAllPlugins, reloadPlugin } from './plugins/index.js'
import { config } from './config.js'

// Handle plugins loading
// Use pluginsModule directly as reference (hot-reload will update it automatically)
let plugins = pluginsModule
let pluginsInitialized = false

const initPlugins = async () => {
    if (pluginsInitialized) {
        // Already initialized - plugins array is already a reference to pluginsModule
        // So it will automatically reflect changes from hot-reload
        return
    }
    
    try {
        if (typeof pluginsModule === 'function') {
            plugins = await pluginsModule()
        } else if (Array.isArray(pluginsModule)) {
            // Use direct reference - changes to pluginsModule will be reflected here
            plugins = pluginsModule
        } else {
            console.error(chalk.red('Invalid plugins module format'))
            plugins = []
        }
        pluginsInitialized = true
        console.log(chalk.green(`✓ Handler initialized with ${plugins.length} plugins`))
    } catch (error) {
        console.error(chalk.red('Failed to initialize plugins:'), error.message)
        plugins = []
        pluginsInitialized = true
    }
}

// Export reload functions for manual reload if needed
export { reloadAllPlugins, reloadPlugin }

// Track processed messages to prevent duplicate processing
const processedMessages = new Set()

// Helper function to send message with typing indicator
async function sendMessageWithTyping(lynae, chatId, message, typingDuration = 2000) {
    try {
        // Start typing indicator
        await lynae.sendPresenceUpdate('composing', chatId)
        
        // Wait for typing duration (simulate typing)
        await new Promise(resolve => setTimeout(resolve, typingDuration))
        
        // Stop typing indicator
        await lynae.sendPresenceUpdate('available', chatId)
        
        // Send the message
        await lynae.sendMessage(chatId, message)
    } catch (error) {
        console.error(chalk.red('Error sending message with typing:'), error)
        // Fallback: send message tanpa typing indicator
        await lynae.sendMessage(chatId, message)
    }
}

// Main message handler function
const handler = async (lynae, m) => {
    // Ensure plugins are loaded
    if (!pluginsInitialized) {
        await initPlugins()
    }
    // Note: plugins is a reference to pluginsModule array, so hot-reload changes are automatic
    
    try {
        // Get message data
        const { messages, type } = m
        
        // Only process notify type messages
        if (type !== 'notify' && type !== 'append') return
        
        const msg = messages[0]
        if (!msg || !msg.message) return
        
        // Ignore old messages (prevent processing history)
        // Timestamp is in seconds
        const messageTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp?.low || msg.messageTimestamp)
        if (messageTimestamp && (Date.now() / 1000) - messageTimestamp > 120) { // 2 minutes tolerance
             return
        }
        
        // Ignore messages from bot itself
        // if (msg.key.fromMe) return // Allow self-messages (commands from bot owner/host)
        
        // Create unique message ID to prevent duplicate processing
        const messageId = msg.key.id
        const messageKey = `${msg.key.remoteJid}_${messageId}`
        
        // Check if message already processed
        if (processedMessages.has(messageKey)) {
            return // Skip already processed message
        }
        
        // Mark message as processed
        processedMessages.add(messageKey)
        
        // Clean up old processed messages (keep only last 1000)
        if (processedMessages.size > 1000) {
            const firstKey = processedMessages.values().next().value
            processedMessages.delete(firstKey)
        }
        
        // Process text messages and messages with caption (for sticker command)
        let body = ""
        let hasImage = false
        
        if (msg.message.conversation) {
            body = msg.message.conversation
        } else if (msg.message.extendedTextMessage?.text) {
            body = msg.message.extendedTextMessage.text
        } else if (msg.message.imageMessage) {
            // Check if image has caption
            body = msg.message.imageMessage.caption || ""
            hasImage = true
        } else if (msg.message.videoMessage) {
            body = msg.message.videoMessage.caption || ""
        } else if (msg.message.buttonsResponseMessage?.selectedButtonId) {
            body = msg.message.buttonsResponseMessage.selectedButtonId
        } else if (msg.message.templateButtonReplyMessage?.selectedId) {
            body = msg.message.templateButtonReplyMessage.selectedId
        } else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) {
            body = msg.message.listResponseMessage.singleSelectReply.selectedRowId
        } else {
            // Check if it's a quoted message with image (for sticker command)
            if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage
                if (quotedMsg.imageMessage) {
                    body = msg.message.extendedTextMessage.text || ""
                    hasImage = true
                }
            }
            
            // If no text content and no image, ignore
            if (!body && !hasImage) {
                return
            }
        }
        
        // If no text content and no image, ignore
        if ((!body || body.trim() === "") && !hasImage) return
        
        // Get sender - gunakan participant jika di grup, kalau tidak pakai remoteJid
        // Pastikan ini selalu JID user (bukan grup) untuk kebutuhan seperti getpp
        let sender = msg.key.participant || msg.key.remoteJid
        
        // Fix sender if message is from bot itself
        if (msg.key.fromMe) {
            let botId = lynae.user?.id || lynae.user?.jid || lynae.authState?.creds?.me?.id
            if (!botId && config?.botNumber) botId = config.botNumber
            if (botId) {
                sender = botId.split(':')[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
            }
        }
        
        // If sender is a group, we need to get the actual user
        // In groups, participant should be the user who sent the message
        if (sender && sender.includes('@g.us')) {
            // If remoteJid is group, use participant (the actual user)
            sender = msg.key.participant || sender
        }
        
        // Fallback: if still group or invalid, use remoteJid (might be private chat)
        if (!sender || sender.includes('@g.us')) {
            sender = msg.key.remoteJid
        }
        
        const pushName = msg.pushName || "Unknown"
        
        // Display chat log for text messages only
        const timestamp = new Date().toLocaleTimeString()
        
        console.log(
            chalk.gray(`[${timestamp}]`),
            chalk.green(`[${pushName}]`),
            chalk.yellow(`${(msg.key.remoteJid || sender).split('@')[0]}:`),
            chalk.white(body)
        )
        
        // Process commands if message has prefix or image with caption
        // Supported prefixes: !, /, ., #
        const prefixes = ['!', '/', '.', '#']
        let prefix = null
        let commandText = ''
        let command = ''
        
        if (body) {
            prefix = prefixes.find(p => body.startsWith(p))
            if (prefix) {
                commandText = body.slice(1).trim()
                command = commandText.toLowerCase()
            }
        }
        
        // Also check if image has caption with command
        if (!prefix && hasImage && msg.message.imageMessage?.caption) {
            const caption = msg.message.imageMessage.caption
            prefix = prefixes.find(p => caption.startsWith(p))
            if (prefix) {
                commandText = caption.slice(1).trim()
                command = commandText.toLowerCase()
            }
        }
        
        if (prefix && command) {
            // Try to match command with plugins
            let commandMatched = false
            
            // Check if plugins array is valid
            if (!Array.isArray(plugins) || plugins.length === 0) {
                console.log(chalk.yellow('⚠️  No plugins loaded'))
                return
            }
            
            for (const plugin of plugins) {
                if (plugin.command && plugin.command.test(commandText)) {
                    commandMatched = true
                    
                    // Get actual sender (user JID, bukan grup)
                    // Prioritas: participant (untuk grup) > remoteJid (kalau bukan grup) > sender
                    let actualSender = msg.key.participant
                    if (msg.key.fromMe) {
                        actualSender = sender
                    } else if (!actualSender || actualSender.includes('@g.us')) {
                        // If no participant or participant is group, use remoteJid if it's not a group
                        if (msg.key.remoteJid && !msg.key.remoteJid.includes('@g.us')) {
                            actualSender = msg.key.remoteJid
                        } else {
                            actualSender = sender
                        }
                    }
                    
                    // Final check - pastikan ini JID user
                    if (!actualSender || actualSender.includes('@g.us') || !actualSender.includes('@s.whatsapp.net')) {
                        actualSender = sender
                    }
                    
                    // Extract quoted message info if exists
                    let quotedInfo = null
                    let quotedText = ''
                    if (msg.message.extendedTextMessage?.contextInfo) {
                        const contextInfo = msg.message.extendedTextMessage.contextInfo
                        quotedInfo = {
                            key: {
                                remoteJid: contextInfo.remoteJid || msg.key.remoteJid,
                                fromMe: contextInfo.fromMe || false,
                                id: contextInfo.stanzaId,
                                participant: contextInfo.participant
                            },
                            participant: contextInfo.participant,
                            contextInfo: contextInfo
                        }
                        
                        // Extract quoted message text content
                        if (contextInfo.quotedMessage) {
                            const quotedMsg = contextInfo.quotedMessage
                            if (quotedMsg.conversation) {
                                quotedText = quotedMsg.conversation
                            } else if (quotedMsg.extendedTextMessage?.text) {
                                quotedText = quotedMsg.extendedTextMessage.text
                            } else if (quotedMsg.imageMessage?.caption) {
                                quotedText = quotedMsg.imageMessage.caption
                            } else if (quotedMsg.videoMessage?.caption) {
                                quotedText = quotedMsg.videoMessage.caption
                            }
                        }
                    }
                    
                    // Extract mentions from extendedTextMessage
                    let mentions = []
                    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid) {
                        mentions = msg.message.extendedTextMessage.contextInfo.mentionedJid
                            .filter(jid => jid && typeof jid === 'string' && jid.includes('@s.whatsapp.net') && !jid.includes('@g.us'))
                    }
                    
                    // Helper to unwrap message content (handle ViewOnce)
                    const getActualMessage = (content) => {
                        if (!content) return null
                        if (content.viewOnceMessage?.message) return content.viewOnceMessage.message
                        if (content.viewOnceMessageV2?.message) return content.viewOnceMessageV2.message
                        return content
                    }

                    // Extract image from message (for sticker command)
                    let imageMessage = null
                    const msgContent = getActualMessage(msg.message)
                    const quotedContent = getActualMessage(msg.message.extendedTextMessage?.contextInfo?.quotedMessage)
                    
                    if (msgContent?.imageMessage) {
                        imageMessage = msgContent.imageMessage
                    } else if (quotedContent?.imageMessage) {
                        imageMessage = quotedContent.imageMessage
                    }
                    
                    // Extract video from message (for tomp3 command)
                    let videoMessage = null
                    if (msgContent?.videoMessage) {
                        videoMessage = msgContent.videoMessage
                    } else if (quotedContent?.videoMessage) {
                        videoMessage = quotedContent.videoMessage
                    }
                    
                    // Check if chat is group - check both remoteJid and chat format
                    const remoteJid = msg.key.remoteJid
                    // Group JID always ends with @g.us
                    const isGroup = !!(remoteJid && typeof remoteJid === 'string' && remoteJid.endsWith('@g.us'))
                    
                    // Check if user is admin (for group commands)
                    let isAdmin = false
                    let isBotAdmin = false
                    if (isGroup) {
                        try {
                            const groupMetadata = await lynae.groupMetadata(msg.key.remoteJid)
                            
                            // Helper to extract base number from any JID format (@s.whatsapp.net or @lid)
                            const getBaseNumber = (jid) => {
                                if (!jid) return null
                                const jidStr = String(jid)
                                // Extract number part (before : or @)
                                return jidStr.split(':')[0].split('@')[0]
                            }
                            
                            // Normalize JID for comparison (remove device ID)
                            const normalizeJid = (jid) => {
                                if (!jid) return null
                                let normalized = String(jid)
                                // Remove device ID if present (format: number:device@s.whatsapp.net)
                                if (normalized.includes(':')) {
                                    normalized = normalized.split(':')[0] + '@' + normalized.split('@').pop()
                                }
                                return normalized.toLowerCase()
                            }
                            
                            const normalizedSender = normalizeJid(actualSender)
                            const senderBaseNumber = getBaseNumber(actualSender)
                            
                            // Find participant - handle @lid format by matching base numbers
                            const participant = groupMetadata.participants.find(p => {
                                const pId = p.id || p.jid
                                if (!pId) return false
                                
                                const pBaseNumber = getBaseNumber(pId)
                                const pIdRaw = String(pId).toLowerCase()
                                const senderRaw = String(actualSender).toLowerCase()
                                const normalizedPId = normalizeJid(pId)
                                
                                // Match by base number (works for both @s.whatsapp.net and @lid)
                                if (pBaseNumber && senderBaseNumber && pBaseNumber === senderBaseNumber) {
                                    return true
                                }
                                
                                // Exact match after normalization
                                if (normalizedPId === normalizedSender) {
                                    return true
                                }
                                
                                // Exact match raw
                                if (pIdRaw === senderRaw) {
                                    return true
                                }
                                
                                // Partial match
                                if (pIdRaw.includes(senderBaseNumber) || senderRaw.includes(pBaseNumber)) {
                                    return true
                                }
                                
                                return false
                            })
                            
                            // Check admin status - handle different admin value formats
                            if (participant) {
                                const adminValue = participant.admin
                                isAdmin = adminValue === 'admin' || 
                                         adminValue === true || 
                                         adminValue === 'superadmin' ||
                                         String(adminValue).toLowerCase() === 'admin' ||
                                         participant.admin === 'superadmin'
                                
                                // Debug logging for admin detection
                                if (command === 'hidetag') {
                                    console.log('[ADMIN CHECK]', {
                                        sender: actualSender,
                                        normalizedSender: normalizedSender,
                                        participantId: participant.id || participant.jid,
                                        participantAdmin: participant.admin,
                                        adminValue: adminValue,
                                        isAdmin: isAdmin,
                                        participantsCount: groupMetadata.participants.length
                                    })
                                }
                            } else {
                                // Debug if participant not found
                                if (command === 'hidetag') {
                                    console.log('[ADMIN CHECK] Participant not found:', {
                                        sender: actualSender,
                                        normalizedSender: normalizedSender,
                                        participants: groupMetadata.participants.map(p => p.id || p.jid).slice(0, 5)
                                    })
                                }
                            }
                            
                            // Check if bot is admin - use multiple methods to get bot JID
                            const botUser = lynae.user
                            const botId = botUser?.id || botUser?.jid || botUser?.user || null
                            
                            if (botId) {
                                const botJid = normalizeJid(botId)
                                const botBaseNumber = getBaseNumber(botId)
                                
                                // Find bot participant - handle @lid format by matching base numbers
                                const botParticipant = groupMetadata.participants.find(p => {
                                    const pId = p.id || p.jid
                                    if (!pId) return false
                                    
                                    const pBaseNumber = getBaseNumber(pId)
                                    const pIdRaw = String(pId).toLowerCase()
                                    const botIdRaw = String(botId).toLowerCase()
                                    const normalizedPId = normalizeJid(pId)
                                    
                                    // Match by base number (works for both @s.whatsapp.net and @lid)
                                    if (pBaseNumber && botBaseNumber && pBaseNumber === botBaseNumber) {
                                        return true
                                    }
                                    
                                    // Exact match after normalization
                                    if (normalizedPId === botJid) {
                                        return true
                                    }
                                    
                                    // Exact match raw
                                    if (pIdRaw === botIdRaw) {
                                        return true
                                    }
                                    
                                    // Partial match
                                    if (pIdRaw.includes(botBaseNumber) || botIdRaw.includes(pBaseNumber)) {
                                        return true
                                    }
                                    
                                    return false
                                })
                                
                                if (botParticipant) {
                                    const botAdminValue = botParticipant.admin
                                    isBotAdmin = botAdminValue === 'admin' || 
                                                botAdminValue === true || 
                                                botAdminValue === 'superadmin' ||
                                                String(botAdminValue).toLowerCase() === 'admin'
                                    
                                    // Debug logging for bot admin detection
                                    if (command === 'hidetag') {
                                        console.log('[BOT ADMIN CHECK]', {
                                            botId: botId,
                                            botJid: botJid,
                                            botBaseNumber: botBaseNumber,
                                            botParticipantId: botParticipant.id || botParticipant.jid,
                                            botParticipantAdmin: botParticipant.admin,
                                            botAdminValue: botAdminValue,
                                            isBotAdmin: isBotAdmin
                                        })
                                    }
                                } else {
                                    // Debug if bot participant not found
                                    if (command === 'hidetag') {
                                        console.log('[BOT ADMIN CHECK] Bot participant not found:', {
                                            botId: botId,
                                            botJid: botJid,
                                            botBaseNumber: botBaseNumber,
                                            participants: groupMetadata.participants.map(p => ({
                                                id: p.id || p.jid,
                                                admin: p.admin
                                            })).slice(0, 5)
                                        })
                                    }
                                }
                            } else {
                                // Debug if bot ID not found
                                if (command === 'hidetag') {
                                    console.log('[BOT ADMIN CHECK] Bot ID not found:', {
                                        botUser: botUser,
                                        lynaeUser: lynae.user
                                    })
                                }
                            }
                        } catch (e) {
                            // If error getting group metadata, assume not admin
                            console.error('Error getting group metadata:', e.message)
                            isAdmin = false
                            isBotAdmin = false
                        }
                    }
                    
                    // Prepare handler context
                    const m = {
                        // JID user (pengirim asli / target user)
                        sender: actualSender,
                        // JID chat tempat command dikirim (grup / private)
                        chat: msg.key.remoteJid,
                        body: body,
                        command: command,
                        text: commandText,
                        key: msg.key,
                        quoted: quotedInfo,
                        quotedText: quotedText, // Add quoted message text content
                        mentions: mentions,
                        image: imageMessage,
                        video: videoMessage,
                        // Group-related properties
                        isGroup: isGroup,
                        isAdmin: isAdmin,
                        isBotAdmin: isBotAdmin
                    }
                    
                    // Create lynae wrapper dengan auto-reply & default ke chat asal
                    const lynaeWithReply = new Proxy(lynae, {
                        get: function(target, prop) {
                            if (prop === 'sendMessage') {
                                return async (jid, content, options = {}) => {
                                    // STRICT VALIDATION: Reject null, undefined, empty string, empty object
                                    if (content === null || content === undefined) {
                                        console.error(chalk.yellow('⚠️  Blocked: sendMessage called with null/undefined'))
                                        return { status: 200, blocked: true } // Return success to prevent error
                                    }
                                    
                                    // Handle string content
                                    if (typeof content === 'string') {
                                        const trimmed = content.trim()
                                        // Block empty string or string with only whitespace
                                        if (trimmed === '' || trimmed.length === 0 || /^\s+$/.test(content)) {
                                            console.error(chalk.yellow('⚠️  Blocked: sendMessage called with empty or whitespace-only string'))
                                            return { status: 200, blocked: true }
                                        }
                                        content = { text: trimmed }
                                    }
                                    
                                    // Handle object content
                                    if (typeof content === 'object') {
                                        // Check for react-only messages (allow these)
                                        if (content.react && typeof content.react === 'object') {
                                            // Validate react has text
                                            if (!content.react.text || String(content.react.text).trim() === '') {
                                                console.error(chalk.yellow('⚠️  Blocked: sendMessage called with empty react'))
                                                return { status: 200, blocked: true }
                                            }
                                            // Allow react messages to pass through
                                            const targetJid = jid || msg.key.remoteJid
                                            return await target.sendMessage(targetJid, content, options)
                                        }
                                        
                                        // Check if object is empty
                                        const keys = Object.keys(content)
                                        if (keys.length === 0) {
                                            console.error(chalk.yellow('⚠️  Blocked: sendMessage called with empty object'))
                                            return { status: 200, blocked: true }
                                        }
                                        
                                        // Validate text content if exists - STRICT validation
                                        if (content.text !== undefined) {
                                            if (content.text === null || content.text === undefined) {
                                                delete content.text
                                            } else {
                                                const textStr = String(content.text).trim()
                                                // Block empty string, whitespace-only, or single space
                                                if (textStr === '' || textStr.length === 0 || /^\s+$/.test(String(content.text)) || textStr === ' ') {
                                                    delete content.text
                                                } else {
                                                    content.text = textStr
                                                }
                                            }
                                        }
                                        
                                        // Validate that at least one content type exists (excluding empty text)
                                        const hasValidContent = 
                                            (content.text && typeof content.text === 'string' && content.text.trim().length > 0 && content.text.trim() !== ' ') ||
                                            (content.image && content.image !== null && content.image !== undefined) ||
                                            (content.video && content.video !== null && content.video !== undefined) ||
                                            (content.audio && content.audio !== null && content.audio !== undefined) ||
                                            (content.sticker && content.sticker !== null && content.sticker !== undefined) ||
                                            (content.document && content.document !== null && content.document !== undefined) ||
                                            (content.contacts && Array.isArray(content.contacts) && content.contacts.length > 0) ||
                                            (content.location && content.location !== null && content.location !== undefined) ||
                                            (content.buttons && Array.isArray(content.buttons) && content.buttons.length > 0) ||
                                            (content.list && content.list !== null && content.list !== undefined) ||
                                            (content.sections && Array.isArray(content.sections) && content.sections.length > 0)
                                        
                                        if (!hasValidContent) {
                                            console.error(chalk.yellow('⚠️  Blocked: sendMessage called with no valid content'))
                                            console.error(chalk.yellow('⚠️  Content keys:', Object.keys(content)))
                                            return { status: 200, blocked: true }
                                        }
                                    } else {
                                        // Invalid content type
                                        console.error(chalk.yellow(`⚠️  Blocked: sendMessage called with invalid content type: ${typeof content}`))
                                        return { status: 200, blocked: true }
                                    }

                                    // Tentukan chatId default: kalau tidak diisi, pakai chat asal
                                    let targetJid = jid || msg.key.remoteJid

                                    // Jika plugin mengirim ke sender (user) tapi chat aslinya grup,
                                    // arahkan ke grup supaya balasan muncul di grup, bukan private.
                                    if (
                                        jid === actualSender &&
                                        msg.key.remoteJid &&
                                        msg.key.remoteJid.endsWith('@g.us')
                                    ) {
                                        targetJid = msg.key.remoteJid
                                    }
                                    
                                    // Final check before adding context - ensure we have valid content
                                    const hasContentBeforeContext = 
                                        (content.text && typeof content.text === 'string' && content.text.trim().length > 0) ||
                                        content.image || content.video || content.audio || content.sticker ||
                                        content.document || content.contacts || content.location ||
                                        content.buttons || content.list
                                    
                                    // Only add reply context if we have valid content
                                    if (hasContentBeforeContext && !content.contextInfo && !options.quoted) {
                                        content.contextInfo = {
                                            stanzaId: msg.key.id,
                                            participant: msg.key.participant || sender,
                                            quotedMessage: msg.message
                                        }
                                    }
                                    
                                    // Always use quoted option for reply
                                    const messageOptions = {
                                        ...options,
                                        quoted: options.quoted !== undefined ? options.quoted : msg
                                    }
                                    
                                    // Final validation before sending - STRICT validation
                                    if (content.text !== undefined) {
                                        if (!content.text || content.text === null || content.text === undefined) {
                                            delete content.text
                                        } else {
                                            const textStr = String(content.text).trim()
                                            // Block empty string, whitespace-only, or single space
                                            if (textStr === '' || textStr.length === 0 || /^\s+$/.test(String(content.text)) || textStr === ' ') {
                                                delete content.text
                                            } else {
                                                content.text = textStr
                                            }
                                        }
                                    }
                                    
                                    // Ensure we still have valid content after cleanup - STRICT check
                                    const stillHasContent = 
                                        (content.text && typeof content.text === 'string' && content.text.trim().length > 0 && content.text.trim() !== ' ') ||
                                        (content.image && content.image !== null && content.image !== undefined && content.image !== '') ||
                                        (content.video && content.video !== null && content.video !== undefined && content.video !== '') ||
                                        (content.audio && content.audio !== null && content.audio !== undefined && content.audio !== '') ||
                                        (content.sticker && content.sticker !== null && content.sticker !== undefined && content.sticker !== '') ||
                                        (content.document && content.document !== null && content.document !== undefined && content.document !== '') ||
                                        (content.contacts && Array.isArray(content.contacts) && content.contacts.length > 0) ||
                                        (content.location && content.location !== null && content.location !== undefined && content.location !== '') ||
                                        (content.buttons && Array.isArray(content.buttons) && content.buttons.length > 0) ||
                                        (content.list && content.list !== null && content.list !== undefined && content.list !== '') ||
                                        (content.sections && Array.isArray(content.sections) && content.sections.length > 0)
                                    
                                    if (!stillHasContent) {
                                        console.error(chalk.yellow('⚠️  Blocked: sendMessage - no valid content after cleanup'))
                                        console.error(chalk.yellow('⚠️  Content keys:', Object.keys(content)))
                                        if (content.text !== undefined) {
                                            console.error(chalk.yellow('⚠️  Text value:', JSON.stringify(content.text)))
                                        }
                                        return { status: 200, blocked: true }
                                    }
                                    
                                    // Double check: ensure content object is not empty - STRICT filter
                                    const finalKeys = Object.keys(content).filter(key => {
                                        const value = content[key]
                                        if (key === 'text') {
                                            return value && typeof value === 'string' && value.trim().length > 0 && value.trim() !== ' '
                                        }
                                        // For other types, check they're not null, undefined, or empty string
                                        if (typeof value === 'string') {
                                            return value.trim().length > 0 && value.trim() !== ' '
                                        }
                                        if (Array.isArray(value)) {
                                            return value.length > 0
                                        }
                                        return value !== null && value !== undefined && value !== ''
                                    })
                                    
                                    if (finalKeys.length === 0) {
                                        console.error(chalk.yellow('⚠️  Blocked: sendMessage - content object is empty after final check'))
                                        console.error(chalk.yellow('⚠️  All keys filtered out'))
                                        return { status: 200, blocked: true }
                                    }
                                    
                                    // Send message (only once, with all validations passed)
                                    return await target.sendMessage(targetJid, content, messageOptions)
                                }
                            }
                            return target[prop]
                        }
                    })
                    
                    const context = {
                        lynae: lynaeWithReply,
                        usedPrefix: prefix,
                        command: command,
                        plugins: plugins,
                        isAdmin: isAdmin,
                        isBotAdmin: isBotAdmin
                    }
                    
                    // Send loading indicator (typing)
                    try {
                        await lynae.sendPresenceUpdate('composing', msg.key.remoteJid)
                    } catch (e) {
                        // Ignore
                    }

                    // Alternative: Mark message as read (Blue Ticks) to indicate processing
                    try {
                        await lynae.readMessages([msg.key])
                    } catch (e) {
                        // Ignore
                    }
                    
                    try {
                        // Execute plugin handler
                        await plugin(m, context)
                    } catch (error) {
                        console.error(chalk.red(`Error executing plugin ${plugin.help?.[0] || 'unknown'}:`), error)
                        
                        // Stop typing on error
                        try {
                            await lynae.sendPresenceUpdate('available', msg.key.remoteJid)
                        } catch (e) {
                            // Ignore
                        }
                    }
                    break
                }
            }
            
            // Command not found
            // if (!commandMatched) {
            //     // Optional: send message for unknown command
            // }
        }
    } catch (error) {
        console.error(chalk.red('Error processing message:'), error)
    }
}

export default handler