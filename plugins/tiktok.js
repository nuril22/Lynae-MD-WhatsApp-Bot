import { writeFile, unlink, readFile } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Setup Cache File (JSON) instead of SQLite
const dbDir = path.join(__dirname, '..', 'db')
const cacheFile = path.join(dbDir, 'tiktok_cache.json')

if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
}

// Initialize Cache if not exists
if (!existsSync(cacheFile)) {
    writeFileSync(cacheFile, JSON.stringify({}))
}

// DB Helper Functions (JSON based)
const getCacheData = () => {
    try {
        if (!existsSync(cacheFile)) return {}
        return JSON.parse(readFileSync(cacheFile, 'utf8'))
    } catch (e) {
        return {}
    }
}

const saveCacheData = (data) => {
    try {
        writeFileSync(cacheFile, JSON.stringify(data, null, 2))
    } catch (e) {
        console.error('Error saving cache:', e)
    }
}

const saveCache = async (id, data) => {
    const cache = getCacheData()
    cache[id] = {
        data,
        timestamp: Date.now()
    }
    saveCacheData(cache)
}

const getCache = async (id) => {
    const cache = getCacheData()
    const entry = cache[id]
    return entry ? entry.data : null
}

// Clean old cache (older than 1 hour)
const cleanOldCache = async () => {
    const cache = getCacheData()
    const oneHourAgo = Date.now() - (60 * 60 * 1000)
    let changed = false
    
    for (const id in cache) {
        if (cache[id].timestamp < oneHourAgo) {
            delete cache[id]
            changed = true
        }
    }
    
    if (changed) saveCacheData(cache)
}

const handler = async (m, { lynae, usedPrefix, command }) => {
    await cleanOldCache().catch(console.error)
    const args = m.text.trim().split(/\s+/).slice(1)
    const cmd = command || 'tiktok'
    
    // Check if it's a button response (ID + Action)
    // IDs are generated strings, URLs start with http
    const isUrl = args[0]?.startsWith('http')
    const isButtonAction = args[0] && !isUrl && (args[1] === 'video' || args[1] === 'audio' || args[1] === 'slide')

    if (isButtonAction) {
        const id = args[0]
        const type = args[1]
        
        try {
            const result = await getCache(id)
            if (!result) {
                await lynae.sendMessage(m.chat, { text: '❌ Session expired. Please request the link again.' }, { quoted: m })
                return
            }

            if (result.originalSender && result.originalSender !== m.sender) {
                await lynae.sendMessage(m.chat, { text: '❌ This button is not for you.' }, { quoted: m })
                return
            }

            const tempDir = path.join(__dirname, '..', 'temp')
            if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

            if (type === 'video') {
                await lynae.sendMessage(m.chat, { text: '⏳ Downloading & Sending video...' }, { quoted: m })
                const urls = [result.nowatermark, result.video, result.url, result.download_url, result.play].filter(u => u)
                if (urls.length === 0) throw new Error('Video URL not found.')
                
                let lastError
                let success = false
                for (const url of urls) {
                    try {
                        await sendFile(lynae, m, url, tempDir, 'video')
                        success = true
                        break
                    } catch (e) {
                        lastError = e
                    }
                }
                if (!success) throw lastError || new Error('Failed to send video.')
            } else if (type === 'audio') {
                await lynae.sendMessage(m.chat, { text: '⏳ Downloading & Sending audio...' }, { quoted: m })
                const audioUrl = result.audio || result.music || result.music_info?.play
                if (!audioUrl) throw new Error('Audio URL not found.')
                await sendFile(lynae, m, audioUrl, tempDir, 'audio')
            } else if (type === 'slide') {
                await lynae.sendMessage(m.chat, { text: '⏳ Sending slides...' }, { quoted: m })
                const images = result.images || result.image || []
                if (images.length === 0) throw new Error('No images found.')
                
                for (const imgUrl of images) {
                    await lynae.sendMessage(m.chat, { image: { url: imgUrl } }, { quoted: m })
                }
                await lynae.sendMessage(m.chat, { text: '✅ All slides sent.' }, { quoted: m })
            }

        } catch (error) {
            console.error('TikTok Button Error:', error)
            await lynae.sendMessage(m.chat, { text: `❌ Error: ${error.message}` }, { quoted: m })
        }
        return
    }

    // Initial Request
    const url = args.find(arg => arg.startsWith('http'))
    
    if (!url) {
        await lynae.sendMessage(m.chat, { text: `❌ Please provide a TikTok link.\n\nExample:\n${usedPrefix}${cmd} https://vm.tiktok.com/xyz/` }, { quoted: m })
        return
    }

    await lynae.sendMessage(m.chat, { text: '⏳ Fetching data...' }, { quoted: m })

    try {
        const data = await tiktok(url)
        
        if (!data || !data.result) {
            throw new Error('Media not found or API error.')
        }

        const result = data.result
        
        // Generate ID and save to DB
        const id = Math.random().toString(36).substring(2, 10)
        await saveCache(id, { ...result, originalSender: m.sender })

        // Determine content type
        const isSlide = (result.images && result.images.length > 0) || (result.image && result.image.length > 0)
        const hasAudio = (result.audio || result.music) ? true : false
        
        const caption = `🎵 *TIKTOK DOWNLOADER*

👤 *Author:* ${result.username || result.author?.nickname || '-'}
📝 *Desc:* ${result.description || result.title || '-'}

_Select an option below or type the command:_
🎥 *Video:* ${usedPrefix}${cmd} ${id} video
🎵 *Audio:* ${usedPrefix}${cmd} ${id} audio
${isSlide ? `📸 *Slides:* ${usedPrefix}${cmd} ${id} slide` : ''}`

        const buttons = []
        
        if (isSlide) {
            buttons.push({ 
                buttonId: `${usedPrefix}${cmd} ${id} slide`, 
                buttonText: { displayText: '📸 Download Slides' }, 
                type: 1 
            })
        } else {
            // Video
            buttons.push({ 
                buttonId: `${usedPrefix}${cmd} ${id} video`, 
                buttonText: { displayText: '🎥 Download Video' }, 
                type: 1 
            })
            
            if (hasAudio) {
                buttons.push({ 
                    buttonId: `${usedPrefix}${cmd} ${id} audio`, 
                    buttonText: { displayText: '🎵 Download Audio' }, 
                    type: 1 
                })
            }
        }

        await lynae.sendMessage(m.chat, {
            image: { url: result.thumbnail || result.cover || 'https://i.imgur.com/5Ky6dGk.png' },
            caption: caption,
            buttons: buttons,
            footer: 'Lynae-MD'
        }, { quoted: m })

    } catch (error) {
        console.error('TikTok Error:', error)
        await lynae.sendMessage(m.chat, { text: `❌ Error: ${error.message || 'Internal server error'}` }, { quoted: m })
    }
}

handler.help = ['tiktok <url>', 'tt <url>']
handler.tags = ['downloader']
handler.command = /^(tiktok|tt|tiktokdl)(\s|$)/i

export default handler

// --- HELPER FUNCTIONS ---

async function sendFile(lynae, m, url, tempDir, type) {
    const ext = type === 'audio' ? '.mp3' : '.mp4'

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        })
        
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`)

        const buffer = await response.arrayBuffer()
        const fileBuffer = Buffer.from(buffer)

        // Validasi konten file (cegah file blank/html error)
        const firstBytes = fileBuffer.subarray(0, 50).toString('utf8').trim()
        if (fileBuffer.length < 2048 || firstBytes.startsWith('<') || firstBytes.startsWith('{') || (firstBytes.includes('error') && firstBytes.length < 500)) {
            throw new Error('Invalid media file (likely HTML/JSON error response)')
        }

        if (type === 'audio') {
            await lynae.sendMessage(m.chat, {
                audio: fileBuffer,
                mimetype: 'audio/mpeg',
                ptt: false
            }, { quoted: m })
        } else {
            await lynae.sendMessage(m.chat, {
                video: fileBuffer,
                mimetype: 'video/mp4'
            }, { quoted: m })
        }

    } catch (e) {
        throw e
    }
}

async function tiktok(url) {
    const encodedUrl = encodeURIComponent(url);
    const endpoints = [
        `https://tikwm.com/api/?url=${encodedUrl}&hd=1`,
        `https://api.tiklydown.eu.org/api/download?url=${encodedUrl}`,
        `https://api.ryzumi.vip/api/downloader/ttdl?url=${encodedUrl}`,
        `https://anabot.my.id/api/download/tiktok?url=${encodedUrl}&apikey=freeApikey`, // Prioritas 1 (Sesuai Request)
        `https://api.faa.my.id/api/download/tiktok?url=${encodedUrl}`,
        `https://api.agatz.xyz/api/tiktok?url=${encodedUrl}`,
        `https://api.siputzx.my.id/api/d/tiktok?url=${encodedUrl}`,
        `https://widipe.com/tiktok?url=${encodedUrl}`
    ];

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint);
            const json = await res.json();
            
            // Normalisasi output agar sesuai struktur yang diharapkan handler
            // Target: { result: { video, audio, username, description, thumbnail, nowatermark } }
            
            // TikWM
            if (json.code === 0 && json.data) {
                return { result: json.data }
            }
            
            // TiklyDown
            if (json.video && json.video.noWatermark) {
                return { result: { video: json.video.noWatermark, audio: json.music?.play_url, thumbnail: json.cover, description: json.title, author: json.author } }
            }

            if (json.data && json.data.result) return { result: json.data.result }; // Format Anabot
            if (json.result) return json; // Format umum
            if (json.data) return { result: json.data };
            
            // Handle format lain jika perlu
            if (json.status && json.url) {
                 return { result: { video: json.url, description: json.title, thumbnail: json.thumb, audio: json.music } }
            }

        } catch (e) {
            continue;
        }
    }
    return null;
}