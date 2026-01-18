import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { isOwner } from '../config.js'

const handler = async (m, { lynae, usedPrefix }) => {
    // 1. Check Owner
    // Allow if sender is owner OR if message is from the bot itself (host)
    const isBotHost = m.key.fromMe
    if (!isOwner(m.sender) && !isBotHost) {
        await lynae.sendMessage(m.chat, { text: '❌ This command is only for the bot owner.' }, { quoted: m })
        return
    }

    // 2. Check Quoted Message
    if (!m.quoted) {
        await lynae.sendMessage(m.chat, { text: `❌ Please reply to a status with ${usedPrefix}picksw` }, { quoted: m })
        return
    }

    await lynae.sendMessage(m.chat, { text: '⏳ Processing status...' }, { quoted: m })

    try {
        const quotedMsg = m.quoted.contextInfo?.quotedMessage
        if (!quotedMsg) throw new Error('Could not retrieve message data.')

        // 3. Extract Content
        let content = null
        let mediaType = ''

        const extractContent = (msgContainer) => {
            if (!msgContainer) return null
            if (msgContainer.imageMessage) return { content: msgContainer.imageMessage, type: 'image' }
            if (msgContainer.videoMessage) return { content: msgContainer.videoMessage, type: 'video' }
            if (msgContainer.audioMessage) return { content: msgContainer.audioMessage, type: 'audio' }
            return null
        }

        // Statuses are usually just direct media messages inside the quote
        const extracted = extractContent(quotedMsg)
        if (extracted) {
            content = extracted.content
            mediaType = extracted.type
        }

        if (!content) {
            throw new Error('No media found in the replied message.')
        }

        // 4. Check Media Key & Store Fallback (Robustness)
        if (!content.mediaKey) {
            console.log('[PICKSW] Media Key missing, attempting to load from store...')
            try {
                const sock = lynae.constructor?.name === 'Proxy' ? lynae._target || lynae : lynae
                if (typeof sock.loadMessage === 'function') {
                    // Load using the status ID and remoteJid (usually status@broadcast for statuses)
                    const targetJid = m.quoted.key.remoteJid
                    const fullMessage = await sock.loadMessage(targetJid, m.quoted.key.id)
                    
                    if (fullMessage?.message) {
                        const newExtracted = extractContent(fullMessage.message)
                        if (newExtracted && newExtracted.content?.mediaKey) {
                            content = newExtracted.content
                            mediaType = newExtracted.type
                            console.log('[PICKSW] Recovered content from store')
                        }
                    }
                }
            } catch (err) {
                console.log('[PICKSW] Store lookup failed:', err.message)
            }
        }

        if (!content.mediaKey) {
            throw new Error('Media Key is missing. Cannot decrypt status.')
        }

        // 5. Download
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

        // 6. Send (No Caption)
        if (mediaType === 'image') {
            await lynae.sendMessage(m.chat, { image: buffer }, { quoted: m })
        } else if (mediaType === 'video') {
            await lynae.sendMessage(m.chat, { video: buffer }, { quoted: m })
        } else if (mediaType === 'audio') {
            await lynae.sendMessage(m.chat, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: m })
        }

    } catch (e) {
        console.error('PickSW Error:', e)
        await lynae.sendMessage(m.chat, { text: `❌ Failed to retrieve status: ${e.message}` }, { quoted: m })
    }
}

handler.help = ['picksw']
handler.tags = ['owner']
handler.command = /^(picksw|sw)(\s|$)/i

export default handler