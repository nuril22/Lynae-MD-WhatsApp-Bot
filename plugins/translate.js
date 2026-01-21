import axios from 'axios'

const handler = async (m, { lynae, usedPrefix, command }) => {
    // 1. Check if user is replying to a message
    if (!m.quoted) {
        await lynae.sendMessage(m.chat, { 
            text: `❌ Please reply to a message containing text to translate.\n\nUsage:\n• Reply to a message -> ${usedPrefix}${command} <language_code>\n\nExample:\n• ${usedPrefix}t id (Translate to Indonesian)\n• ${usedPrefix}t en (Translate to English)` 
        }, { quoted: m })
        return
    }

    // 2. Get text from the quoted message
    const text = m.quotedText

    if (!text || text.trim().length === 0) {
        await lynae.sendMessage(m.chat, { 
            text: `❌ The replied message does not contain any text to translate.` 
        }, { quoted: m })
        return
    }

    // 3. Get target language from arguments
    const args = m.text.split(' ').slice(1)
    let lang = args[0]

    if (!lang) {
        await lynae.sendMessage(m.chat, { 
            text: `❌ Please specify the target language code.\n\nExample:\n• ${usedPrefix}t id\n• ${usedPrefix}t en\n• ${usedPrefix}t ja` 
        }, { quoted: m })
        return
    }

    // Map common language names to ISO codes
    const langMap = {
        'indonesia': 'id', 'indo': 'id', 'id': 'id',
        'english': 'en', 'inggris': 'en', 'en': 'en',
        'indonesia': 'id', 'indo': 'id', 'id': 'id', 'indonesian': 'id',
        'english': 'en', 'inggris': 'en', 'en': 'en', 'ing': 'en',
        'japanese': 'ja', 'jepang': 'ja', 'jp': 'ja',
        'korean': 'ko', 'korea': 'ko', 'ko': 'ko',
        'chinese': 'zh-CN', 'china': 'zh-CN', 'mandarin': 'zh-CN', 'cn': 'zh-CN',
        'arabic': 'ar', 'arab': 'ar', 'ar': 'ar',
        'spanish': 'es', 'spanyol': 'es', 'es': 'es',
        'french': 'fr', 'prancis': 'fr', 'fr': 'fr',
        'german': 'de', 'jerman': 'de', 'de': 'de',
        'russian': 'ru', 'rusia': 'ru', 'ru': 'ru',
        'javanese': 'jv', 'jawa': 'jv', 'jv': 'jv',
        'sundanese': 'su', 'sunda': 'su', 'su': 'su'
    }

    const targetLang = langMap[lang.toLowerCase()] || lang

    // Send processing message
    await lynae.sendMessage(m.chat, { text: '⏳ Translating...' }, { quoted: m })

    try {
        // 4. Call Google Translate API
        const result = await translate(text, targetLang)
        
        const caption = `🌍 *TRANSLATION*\n\n` +
                        `📝 *Original:* ${text}\n` +
                        `🔤 *To:* ${targetLang.toUpperCase()}\n\n` +
                        `✨ *Result:*\n${result}`

        await lynae.sendMessage(m.chat, { text: caption }, { quoted: m })

    } catch (error) {
        console.error('Translate Error:', error)
        await lynae.sendMessage(m.chat, { 
            text: `❌ Translation failed.\nError: ${error.message}` 
        }, { quoted: m })
    }
}

handler.help = ['translate <lang>', 't <lang>']
handler.tags = ['tools']
handler.command = /^(translate|t|tr)(\s|$)/i

export default handler

// Helper function to fetch translation
async function translate(text, lang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    })
    
    // Google Translate API returns nested arrays
    // data[0] contains the translation segments
    if (response.data && Array.isArray(response.data[0])) {
        return response.data[0].map(item => item[0]).join('')
    }
    
    throw new Error('Invalid response from Google Translate')
}