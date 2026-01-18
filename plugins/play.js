const handler = async (m, { lynae, usedPrefix, command }) => {
    // Get text after command (arguments)
    const args = m.text.split(' ').slice(1)
    const text = args.join(' ').trim()

    if (!text) {
        await lynae.sendMessage(m.chat, { 
            text: `❌ Please provide a song title or link.\n\nUsage:\n• ${usedPrefix}play <title/link>\n\nExample:\n• ${usedPrefix}play Never Gonna Give You Up`
        }, { quoted: m })
        return
    }

    try {
        // Send loading message
        await lynae.sendMessage(m.chat, { text: `🔍 Searching/Downloading: *${text}*...` }, { quoted: m })

        const result = await play(text)

        if (!result.success) {
            throw new Error(result.error || 'Song not found.')
        }

        const caption = `🎵 *PLAY MUSIC*

📌 *Title:* ${result.title}
👤 *Channel:* ${result.channel}
🔗 *Link:* ${result.url || '-'}

_Sending audio file, please wait..._`

        // Send Info with Embed Style (Large Thumbnail)
        await lynae.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: result.title,
                    body: result.channel || 'Lynae-MD',
                    thumbnailUrl: result.cover,
                    sourceUrl: result.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

        // Send Audio
        await lynae.sendMessage(m.chat, {
            audio: { url: result.downloadUrl },
            mimetype: 'audio/mpeg',
            fileName: `${result.title}.mp3`
        }, { quoted: m })

    } catch (error) {
        console.error('Play command error:', error)
        await lynae.sendMessage(m.chat, { 
            text: `❌ Error: ${error.message}` 
        }, { quoted: m })
    }
}

handler.help = ['play <title>']
handler.tags = ['downloader']
handler.command = /^(play)(\s|$)/i

export default handler

export async function play(query) {
    const encoded = encodeURIComponent(query);
    const endpoints = [
        `https://api-faa.my.id/faa/ytplay?query=${encoded}`,
        `https://api.ootaizumi.web.id/downloader/youtube/play?query=${encoded}`,
        `https://api.nekolabs.web.id/downloader/youtube/play/v1?q=${encoded}`,
        `https://anabot.my.id/api/download/playmusic?query=${encoded}&apikey=freeApikey`,
        `https://api.elrayyxml.web.id/api/downloader/ytplay?q=${encoded}`,
    ];

    for (const endpoint of endpoints) {
        const res = await fetch(endpoint).catch(() => null);
        if (!res) continue;

        let json;
        try { json = await res.json(); } catch { continue; }
        if (!json || (!json.success && !json.status)) continue;

        if (json.result?.downloadUrl && json.result?.metadata) {
            const { title, channel, cover, url } = json.result.metadata;
            return {
                success: true,
                title: title || "Unknown Title",
                channel: channel || "Unknown Artist",
                cover: cover || null,
                url: url || null,
                downloadUrl: json.result.downloadUrl,
            };
        }

        if (json.result?.mp3 && json.result?.title) {
            return {
                success: true,
                title: json.result.title || "Unknown Title",
                channel: json.result.author || "Unknown Artist",
                cover: json.result.thumbnail || null,
                url: json.result.url || null,
                downloadUrl: json.result.mp3,
            };
        }

        if (json.result?.download && json.result?.title) {
            return {
                success: true,
                title: json.result.title || "Unknown Title",
                channel: json.result.author?.name || "Unknown Channel",
                cover: json.result.thumbnail || json.result.image || null,
                url: json.result.url || null,
                downloadUrl: json.result.download,
            };
        }

        const ana = json.data?.result;
        if (ana?.success && ana?.urls && ana?.metadata) {
            return {
                success: true,
                title: ana.metadata.title || "Unknown Title",
                channel: ana.metadata.channel || "Unknown Channel",
                cover: ana.metadata.thumbnail || null,
                url: ana.metadata.webpage_url || null,
                downloadUrl: ana.urls,
            };
        }

        const elray = json.result;
        if (
            elray?.download_url &&
            elray?.title &&
            elray?.channel &&
            elray?.thumbnail &&
            elray?.url
        ) {
            return {
                success: true,
                title: elray.title || "Unknown Title",
                channel: elray.channel || "Unknown Channel",
                cover: elray.thumbnail || null,
                url: elray.url || null,
                downloadUrl: elray.download_url,
            };
        }
    }

    return {
        success: false,
        error: "No downloadable track found from any provider.",
    };
}