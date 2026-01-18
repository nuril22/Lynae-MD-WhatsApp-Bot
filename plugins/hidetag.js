import { isOwner } from '../config.js'

const handler = async (m, { lynae, usedPrefix }) => {
    const chatId = m.chat || m.sender
    
    // Check if command is used in a group
    if (!m.isGroup) {
        await lynae.sendMessage(chatId, {
            text: `❌ This command can only be used in a group.`
        })
        return
    }
    
    // Get group metadata once (used for both admin check and participants)
    let groupMetadata
    try {
        groupMetadata = await lynae.groupMetadata(chatId)
    } catch (error) {
        console.error('Error getting group metadata:', error)
        await lynae.sendMessage(chatId, {
            text: `❌ An error occurred while getting group information.`
        })
        return
    }
    
    // Check if user is admin
    // Priority 1: Use isAdmin from context
    let isAdmin = m.isAdmin || false
    
    // Priority 2: Check if user is owner (bypass admin check)
    if (isOwner(m.sender)) {
        isAdmin = true
    }
    
    // Priority 3: If not admin from context, verify directly from fresh group metadata
    if (!isAdmin) {
        try {
            // Normalize sender to number only for comparison (regex is safest)
            const senderNumber = m.sender.replace(/[^0-9]/g, '')
            
            const participant = groupMetadata.participants.find(p => {
                const pId = p.id || p.jid
                const pNumber = (pId || '').replace(/[^0-9]/g, '')
                return pNumber === senderNumber
            })
            
            if (participant) {
                isAdmin = participant.admin === 'admin' || participant.admin === 'superadmin' || participant.admin === true
            }
        } catch (error) {
            // Ignore error
        }
    }
    
    if (!isAdmin) {
        await lynae.sendMessage(chatId, {
            text: `❌ This command can only be used by group admins.`
        })
        return
    }
    
    // Get text after command
    const args = m.text.split(' ').slice(1)
    let text = args.join(' ').trim()
    
    // Check if there's a quoted message (reply)
    if ((!text || text.length === 0) && m.quoted) {
        // Use quoted message text if available
        if (m.quotedText && m.quotedText.trim()) {
            text = m.quotedText.trim()
        }
    }
    
    // Check if text is provided (either from command or quoted message)
    if (!text || text.length === 0) {
        await lynae.sendMessage(chatId, {
            text: `❌ Please include the message you want to send or reply to a message.\n\nUsage:\n• ${usedPrefix}hidetag <text>\n• ${usedPrefix}hidetag (with reply to message)\n\nExample:\n• ${usedPrefix}hidetag Hello everyone!\n• Reply to a message then type: ${usedPrefix}hidetag`
        })
        return
    }
    
    try {
        // Get all participant JIDs (excluding bot itself)
        const botUser = lynae.user
        const botId = botUser?.id || botUser?.jid || botUser?.user || null
        const botNumber = botId ? botId.replace(/[^0-9]/g, '') : ''
        
        // Filter participants (exclude bot)
        const participants = groupMetadata.participants
            .map(p => {
                const pId = p.id || p.jid
                if (!pId) return null
                return String(pId)
            })
            .filter(jid => {
                if (!jid) return false
                // Exclude bot
                const number = jid.replace(/[^0-9]/g, '')
                if (botNumber && number === botNumber) {
                    return false
                }
                // Only include valid WhatsApp JIDs
                return jid.includes('@s.whatsapp.net') || jid.includes('@lid')
            })
        
        if (participants.length === 0) {
            await lynae.sendMessage(chatId, {
                text: `❌ No group participants can be tagged.`
            })
            return
        }
        
        // Send typing indicator
        await lynae.sendPresenceUpdate('composing', chatId)
        await new Promise(resolve => setTimeout(resolve, 1000))
        await lynae.sendPresenceUpdate('available', chatId)
        
        // Manually construct contextInfo to ensure mentions are processed correctly
        // This bypasses potential issues with auto-quote overwriting mentions
        const contextInfo = {
            mentionedJid: participants
        }
        
        // Preserve reply context if available
        if (m.quoted) {
            contextInfo.stanzaId = m.quoted.key.id
            contextInfo.participant = m.quoted.participant
            contextInfo.quotedMessage = m.quoted.contextInfo?.quotedMessage
        }
        
        // Send message with explicit contextInfo and disable auto-quote
        await lynae.sendMessage(chatId, { 
            text: text,
            contextInfo: contextInfo
        }, { quoted: null })
        
    } catch (error) {
        console.error('Error in hidetag command:', error)
        await lynae.sendMessage(chatId, {
            text: `❌ An error occurred while sending the message: ${error.message}`
        })
    }
}

handler.help = ['hidetag <text>', 'h <text>']
handler.tags = ['group']
handler.command = /^(hidetag|h)(\s|$)/i
handler.description = 'Send a message with mention to all group members (Admin only)'

export default handler
