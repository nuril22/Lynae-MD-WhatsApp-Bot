import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { isOwner } from '../config.js'

const handler = async (m, { lynae, usedPrefix }) => {
    // 1. Check Owner
    if (!isOwner(m.sender)) {
        await lynae.sendMessage(m.chat, { text: '❌ This command is only for the bot owner.' }, { quoted: m })
        return
    }

    // 2. Check Quoted Message
    if (!m.quoted) {
        await lynae.sendMessage(m.chat, { text: `❌ Please reply to a ViewOnce message with ${usedPrefix}pick` }, { quoted: m })
        return
    }

    // Send processing message immediately
    await lynae.sendMessage(m.chat, { text: '⏳ Processing media...' }, { quoted: m })

    try {
        // 3. Get Quoted Message Content
        const quotedMsg = m.quoted.contextInfo?.quotedMessage
        if (!quotedMsg) throw new Error('Could not retrieve message data.')

        // Debug: Log keys to help identify structure
        console.log('[PICK] Quoted Message Keys:', Object.keys(quotedMsg))

        // 4. Detect ViewOnce & Extract Content
        let content = null
        let mediaType = ''

        // Helper to extract content from a message container
        const extractContent = (msgContainer) => {
            if (!msgContainer) return null
            if (msgContainer.imageMessage) return { content: msgContainer.imageMessage, type: 'image' }
            if (msgContainer.videoMessage) return { content: msgContainer.videoMessage, type: 'video' }
            if (msgContainer.audioMessage) return { content: msgContainer.audioMessage, type: 'audio' }
            return null
        }

        // Check Ephemeral Message
        if (quotedMsg.ephemeralMessage?.message) {
            const extracted = extractContent(quotedMsg.ephemeralMessage.message)
            if (extracted) {
                content = extracted.content
                mediaType = extracted.type
            }
        }
        // Check ViewOnce V2
        else if (quotedMsg.viewOnceMessageV2) {
            const extracted = extractContent(quotedMsg.viewOnceMessageV2.message)
            if (extracted) {
                content = extracted.content
                mediaType = extracted.type
            }
        }
        // Check ViewOnce V2 Extension
        else if (quotedMsg.viewOnceMessageV2Extension) {
             const extracted = extractContent(quotedMsg.viewOnceMessageV2Extension.message)
             if (extracted) {
                 content = extracted.content
                 mediaType = extracted.type
             }
        }
        // Check ViewOnce V1
        else if (quotedMsg.viewOnceMessage) {
            const extracted = extractContent(quotedMsg.viewOnceMessage.message)
            if (extracted) {
                content = extracted.content
                mediaType = extracted.type
            }
        }
        // Fallback: Check direct media (sometimes quoted message is just the media)
        else {
            const extracted = extractContent(quotedMsg)
            if (extracted) {
                content = extracted.content
                mediaType = extracted.type
            }
        }

        if (!content) {
            throw new Error('Not a valid media message (or unsupported format).')
        }

        // NEW: Try to recover missing mediaKey from store if missing
        if (!content.mediaKey) {
            console.log('[PICK] Media Key missing, attempting to load from store...')
            try {
                // Access original socket if proxy
                const sock = lynae.constructor?.name === 'Proxy' ? lynae._target || lynae : lynae
                
                // Check if loadMessage method exists (requires store to be bound)
                if (typeof sock.loadMessage === 'function') {
                    // Try loading with remoteJid (chat) and stanzaId
                    const fullMessage = await sock.loadMessage(m.chat, m.quoted.key.id)
                    
                    if (fullMessage?.message) {
                        console.log('[PICK] Message loaded from store')
                        // Re-run extraction on full message
                        const fullMsgContent = fullMessage.message
                        let newContent = null
                        let newType = ''
                        
                        // Try ViewOnce V2
                        if (fullMsgContent.viewOnceMessageV2?.message) {
                            const inner = fullMsgContent.viewOnceMessageV2.message
                            if (inner.imageMessage) { newContent = inner.imageMessage; newType = 'image' }
                            else if (inner.videoMessage) { newContent = inner.videoMessage; newType = 'video' }
                        }
                        // Try ViewOnce V1
                        else if (fullMsgContent.viewOnceMessage?.message) {
                            const inner = fullMsgContent.viewOnceMessage.message
                            if (inner.imageMessage) { newContent = inner.imageMessage; newType = 'image' }
                            else if (inner.videoMessage) { newContent = inner.videoMessage; newType = 'video' }
                        }
                        // Try Direct
                        else if (fullMsgContent.imageMessage) {
                            newContent = fullMsgContent.imageMessage; newType = 'image'
                        } else if (fullMsgContent.videoMessage) {
                            newContent = fullMsgContent.videoMessage; newType = 'video'
                        }

                        if (newContent && newContent.mediaKey) {
                            content = newContent
                            mediaType = newType
                            console.log('[PICK] Recovered content with Media Key')
                        }
                    }
                }
            } catch (err) {
                console.log('[PICK] Store lookup failed:', err.message)
            }
        }

        // Check for Media Key again
        if (!content.mediaKey) {
            throw new Error('Media Key is missing. The bot must have received the original message while online to decrypt it.')
        }

        // 5. Download Media
        // We construct a message object structure that downloadMediaMessage expects
        const messageType = mediaType === 'image' ? 'imageMessage' : (mediaType === 'video' ? 'videoMessage' : 'audioMessage')
        const fakeMessage = { [messageType]: content }

        const buffer = await downloadMediaMessage(
            {
                key: m.quoted.key,
                message: fakeMessage
            },
            'buffer',
            {},
            { logger: console }
        )

        // 6. Send Media Back
        if (mediaType === 'image') {
            await lynae.sendMessage(m.chat, { image: buffer }, { quoted: m })
        } else {
            await lynae.sendMessage(m.chat, { video: buffer }, { quoted: m })
        }

    } catch (e) {
        console.error('Pick Error:', e)
        await lynae.sendMessage(m.chat, { text: `❌ Failed to retrieve media: ${e.message}` }, { quoted: m })
    }
}

handler.help = ['pick']
handler.tags = ['owner']
handler.command = /^(pick)$/i

export default handler