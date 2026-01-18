import { downloadMediaMessage } from '@whiskeysockets/baileys'

const handler = async (m, { lynae, usedPrefix, command }) => {
    // 1. Check Quoted Message
    if (!m.quoted) {
        await lynae.sendMessage(m.chat, { text: `❌ Please reply to a sticker with ${usedPrefix}${command} <packname>|<author>` }, { quoted: m })
        return
    }

    // 2. Check if quoted message is a sticker
    const quotedMsg = m.quoted.contextInfo?.quotedMessage
    if (!quotedMsg || !quotedMsg.stickerMessage) {
        await lynae.sendMessage(m.chat, { text: `❌ Please reply to a sticker.` }, { quoted: m })
        return
    }

    // 3. Parse Arguments
    // Remove command from text to get arguments
    const text = m.text.replace(/^(wm|take)\s*/i, '').trim()
    
    let [packname, author] = text.split('|')
    packname = (packname || '').trim()
    author = (author || '').trim()

    await lynae.sendMessage(m.chat, { text: '⏳ Processing...' }, { quoted: m })

    try {
        // 4. Download Sticker
        const buffer = await downloadMediaMessage(
            {
                key: m.quoted.key,
                message: quotedMsg
            },
            'buffer',
            {},
            { logger: console }
        )

        if (!buffer) throw new Error('Failed to download sticker.')

        // 5. Add New Metadata
        const webpWithExif = await addExif(buffer, packname, author)

        // 6. Send New Sticker
        await lynae.sendMessage(m.chat, { sticker: webpWithExif }, { quoted: m })

    } catch (e) {
        console.error('WM Error:', e)
        await lynae.sendMessage(m.chat, { text: `❌ Error: ${e.message}` }, { quoted: m })
    }
}

handler.help = ['wm <packname>|<author>']
handler.tags = ['sticker']
handler.command = /^(wm|take)(\s|$)/i

export default handler

// Helper function to add Exif (Metadata)
async function addExif(webpBuffer, packname, author) {
    const json = { "sticker-pack-id": "com.snowcorp.stickerly.android.stickercontentprovider b5e7275f-f1de-4137-961f-57becfad34f2", "sticker-pack-name": packname, "sticker-pack-publisher": author, "emojis": [""] }
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
        console.error('[WM] ⚠️ Failed to add metadata. Ensure "node-webpmux" is installed.\nError:', e.message)
        return webpBuffer
    }
}