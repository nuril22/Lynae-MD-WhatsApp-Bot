import axios from 'axios'
import * as cheerio from 'cheerio'
import { config } from '../config.js'

const handler = async (m, { lynae, usedPrefix, command }) => {
    // Get text after command
    const text = m.text.split(' ').slice(1).join(' ').trim()

    // Check if title is provided
    if (!text) {
        await lynae.sendMessage(m.chat, { 
            text: `❌ Please provide a song title.\n\nUsage:\n• ${usedPrefix}${command} <title>\n\nExample:\n• ${usedPrefix}${command} Never Gonna Give You Up` 
        }, { quoted: m })
        return
    }

    // Check if API Key is configured
    if (!config.geniusApiKey) {
        await lynae.sendMessage(m.chat, { 
            text: `⚠️ Genius API Key is not configured.\n\nPlease add your API Key to 'config.js'.\nYou can get it from: https://genius.com/api-clients` 
        }, { quoted: m })
        return
    }

    // Send typing indicator
    await lynae.sendPresenceUpdate('composing', m.chat)

    try {
        // 1. Search for the song using Genius API
        const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(text)}`
        const searchResponse = await axios.get(searchUrl, {
            headers: { 'Authorization': `Bearer ${config.geniusApiKey}` }
        })

        const hits = searchResponse.data.response.hits
        
        if (!hits || hits.length === 0) {
            await lynae.sendMessage(m.chat, { text: `❌ Lyrics for "${text}" not found.` }, { quoted: m })
            return
        }

        // Get the most relevant result
        const song = hits[0].result
        const lyricsUrl = song.url
        const title = song.full_title
        const artist = song.primary_artist.name
        const image = song.header_image_thumbnail_url

        // 2. Fetch the lyrics page HTML
        const lyricsResponse = await axios.get(lyricsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        })
        const $ = cheerio.load(lyricsResponse.data)

        // 3. Extract lyrics from the HTML
        // Genius stores lyrics in containers with 'data-lyrics-container="true"'
        $('script').remove()
        $('style').remove()

        let lyrics = ''
        $('div[data-lyrics-container="true"]').each((i, elem) => {
            // Replace <br> tags with newlines for proper formatting
            $(elem).find('br').replaceWith('\n')
            lyrics += $(elem).text().trim() + '\n\n'
        })

        // Clean up lyrics
        lyrics = lyrics.trim()
        lyrics = lyrics.replace(/^\d+\s+Contributors[\s\S]*?Lyrics\s*/, '') // Hapus header "Contributors... Lyrics"
        lyrics = lyrics.replace(/\s*Embed$/, '') // Hapus kata "Embed" di akhir
        lyrics = lyrics.replace(/\n{3,}/g, '\n\n') // Hapus enter berlebih (max 2 enter)

        if (!lyrics) {
            await lynae.sendMessage(m.chat, { text: `❌ Failed to retrieve lyrics content for "${title}".` }, { quoted: m })
            return
        }

        // 4. Send the result
        const caption = `🎤 *${title}*\n👤 *${artist}*\n\n${lyrics}`

        await lynae.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: title,
                    body: artist,
                    thumbnailUrl: image,
                    sourceUrl: lyricsUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

    } catch (error) {
        console.error('Error in lyrics command:', error)
        await lynae.sendMessage(m.chat, { 
            text: `❌ An error occurred while fetching lyrics.\nError: ${error.message}` 
        }, { quoted: m })
    }
}

handler.help = ['lyrics <title>']
handler.tags = ['tools']
handler.command = /^(lyrics|lirik)(\s|$)/i

export default handler
