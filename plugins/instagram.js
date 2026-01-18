import { writeFile, unlink } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const handler = async (m, { lynae, usedPrefix, command }) => {
    const args = m.text.split(' ').slice(1)
    if (!args[0]) {
        const cmd = command || 'ig'
        await lynae.sendMessage(m.chat, { text: `❌ Please provide an Instagram link.\n\nExample:\n${usedPrefix}${cmd} https://www.instagram.com/p/CzoHzuRvdVh` }, { quoted: m })
        return
    }

    const url = args[0]
    await lynae.sendMessage(m.chat, { text: '⏳ Downloading media, please wait...' }, { quoted: m })

    try {
        const res = await instagram(url)
        
        if (!res || !res.result) {
            throw new Error('Media not found or API error.')
        }

        // Handle if result is array (carousel) or single object
        const results = Array.isArray(res.result) ? res.result : [res.result]

        if (!results || results.length === 0) {
            throw new Error('No media found in the link.')
        }

        const tempDir = path.join(__dirname, '..', 'temp')
        if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true })
        }

        for (const item of results) {
            // Prioritize HD/Video URL if available
            const mediaUrl = typeof item === 'string' ? item : (
                item.hd_url || 
                item.video_hd || 
                item.video_url || 
                (typeof item.hd === 'string' ? item.hd : null) ||
                item.video || 
                item.url || 
                item.download_url || 
                item.link || 
                item._url
            )
            if (!mediaUrl) continue
            
            let filePath = null

            try {
                // Try downloading with User-Agent to avoid 403
                const response = await fetch(mediaUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                })
                
                if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`)

                const buffer = await response.arrayBuffer()
                const fileBuffer = Buffer.from(buffer)
                
                // Validate file content to prevent sending blank/corrupt files
                // Check for small size or text content (HTML/JSON)
                const firstBytes = fileBuffer.subarray(0, 50).toString('utf8').trim()
                if (fileBuffer.length < 2048 || firstBytes.startsWith('<') || firstBytes.startsWith('{') || (firstBytes.includes('error') && firstBytes.length < 500)) {
                    throw new Error('Invalid media file (likely HTML/JSON error response)')
                }

                // Detect file type from buffer (Magic Bytes)
                const fileType = getFileType(fileBuffer)
                
                // Default to image if detection fails but we have content, unless it looks like a video from URL
                let isVideo = false
                let ext = '.jpg'
                let mimetype = 'image/jpeg'

                if (fileType) {
                    isVideo = fileType.type === 'video'
                    ext = fileType.ext
                    mimetype = fileType.mime
                } else {
                    // Fallback to Content-Type or URL
                    const contentType = response.headers.get('content-type')
                    if (contentType && contentType.includes('video')) {
                        isVideo = true
                        ext = '.mp4'
                        mimetype = 'video/mp4'
                    } else if (mediaUrl.includes('.mp4')) {
                        isVideo = true
                        ext = '.mp4'
                        mimetype = 'video/mp4'
                    }
                }

                const filename = `ig_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`
                filePath = path.join(tempDir, filename)

                await writeFile(filePath, fileBuffer)
                
                await lynae.sendMessage(m.chat, {
                    [isVideo ? 'video' : 'image']: { url: filePath },
                    mimetype: mimetype
                }, { quoted: m })
            } catch (e) {
                console.error('Error downloading/sending media:', e)
                await lynae.sendMessage(m.chat, { text: `❌ Failed to send media: ${e.message}` }, { quoted: m })
            } finally {
                if (filePath && existsSync(filePath)) await unlink(filePath).catch(() => {})
            }
        }

    } catch (error) {
        console.error('Instagram Error:', error)
        await lynae.sendMessage(m.chat, { text: `❌ Error: ${error.message || 'Internal server error'}` }, { quoted: m })
    }
}

handler.help = ['instagram <url>', 'ig <url>']
handler.tags = ['downloader']
handler.command = /^(instagram|ig)(\s|$)/i

export default handler

async function instagram(url) {
    const encodedUrl = encodeURIComponent(url);
    const endpoints = [
        `https://api.ryzumi.vip/api/downloader/igdl?url=${encodedUrl}`,
        `https://api.tiklydown.eu.org/api/download/ig?url=${encodedUrl}`,
        `https://api.faa.my.id/api/download/instagram?url=${encodedUrl}`,
        `https://anabot.my.id/api/download/instagram?url=${encodedUrl}&apikey=freeApikey`,
        `https://api.elrayyxml.web.id/api/downloader/igdl?url=${encodedUrl}`,
        `https://api.agatz.xyz/api/instagram?url=${encodedUrl}`,
        `https://api.siputzx.my.id/api/d/igdl?url=${encodedUrl}`,
        `https://widipe.com/igdl?url=${encodedUrl}`,
        `https://api.vreden.my.id/api/igdownload?url=${encodedUrl}`
    ];

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint);
            const json = await res.json();
            
            // Handle nested data.result structure
            if (json.data && json.data.result) {
                return { result: json.data.result };
            }
            
            if (json.data && Array.isArray(json.data)) return { result: json.data };
            if (json.result) return json;
            if (json.data) return { result: json.data };
            if (json.url_list) return { result: json.url_list };
            if (json.media) return { result: json.media };
            if (Array.isArray(json)) return { result: json };
        } catch (e) {
            continue;
        }
    }
    return null;
}

function getFileType(buffer) {
    if (buffer.length < 12) return null
    const header = buffer.subarray(0, 12).toString('hex')
    if (header.startsWith('ffd8ff')) return { type: 'image', ext: '.jpg', mime: 'image/jpeg' }
    if (header.startsWith('89504e47')) return { type: 'image', ext: '.png', mime: 'image/png' }
    if (header.startsWith('47494638')) return { type: 'image', ext: '.gif', mime: 'image/gif' }
    if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return { type: 'video', ext: '.mp4', mime: 'video/mp4' }
    if (header.startsWith('1a45dfa3')) return { type: 'video', ext: '.mkv', mime: 'video/x-matroska' }
    return null
}