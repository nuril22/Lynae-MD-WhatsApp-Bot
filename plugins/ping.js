import os from 'os'
import process from 'process'
import { media } from '../lynae.js'

const handler = async (m, { lynae, usedPrefix }) => {
    // Start ping timer
    const startTime = Date.now()
    
    // Get system information
    const totalRAM = os.totalmem()
    const freeRAM = os.freemem()
    const usedRAM = totalRAM - freeRAM
    
    // Format bytes to readable format
    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
    }
    
    // Get CPU info
    const cpus = os.cpus()
    const cpuModel = cpus[0]?.model || 'Unknown'
    const cpuCores = cpus.length
    
    // Get OS info
    const osType = os.type()
    const osPlatform = os.platform()
    const osRelease = os.release()
    const osArch = os.arch()
    
    // Get uptime
    const uptimeSeconds = process.uptime()
    const days = Math.floor(uptimeSeconds / 86400)
    const hours = Math.floor((uptimeSeconds % 86400) / 3600)
    const minutes = Math.floor((uptimeSeconds % 3600) / 60)
    const seconds = Math.floor(uptimeSeconds % 60)
    const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`
    
    // Calculate RAM percentage
    const ramPercent = ((usedRAM / totalRAM) * 100).toFixed(1)
    
    // Format system info message
    const systemInfo = `╭─「 *SYSTEM INFO* 」
│
│ *🖥️ Operating System*
│ • OS: ${osType} ${osRelease}
│ • Platform: ${osPlatform}
│ • Architecture: ${osArch}
│
│ *💾 Memory (RAM)*
│ • Total: ${formatBytes(totalRAM)}
│ • Used: ${formatBytes(usedRAM)} (${ramPercent}%)
│ • Free: ${formatBytes(freeRAM)}
│
│ *⚙️ Processor*
│ • Model: ${cpuModel}
│ • Cores: ${cpuCores}
│
│ *⏱️ Uptime*
│ • ${uptime}
│
╰─「 *Pong! 🏓* 」`
    
    const chatId = m.chat || m.sender

    // Start typing indicator
    await lynae.sendPresenceUpdate('composing', chatId)
    await new Promise(resolve => setTimeout(resolve, 3000))
    await lynae.sendPresenceUpdate('available', chatId)
    
    // Calculate ping (latency)
    const endTime = Date.now()
    const ping = endTime - startTime
    
    // Add ping information to message
    const finalMessage = `╭─「 *SYSTEM INFO* 」
│
│ *🖥️ Operating System*
│ • OS: ${osType} ${osRelease}
│ • Platform: ${osPlatform}
│ • Architecture: ${osArch}
│
│ *💾 Memory (RAM)*
│ • Total: ${formatBytes(totalRAM)}
│ • Used: ${formatBytes(usedRAM)} (${ramPercent}%)
│ • Free: ${formatBytes(freeRAM)}
│
│ *⚙️ Processor*
│ • Model: ${cpuModel}
│ • Cores: ${cpuCores}
│
│ *⏱️ Uptime*
│ • ${uptime}
│
│ *📡 Bot Ping*
│ • ${ping}ms
│
╰─「 *Pong! 🏓* 」`
    
    // Kirim dengan banner jika tersedia
    if (media.banner) {
        await lynae.sendMessage(chatId, {
            image: media.banner,
            caption: finalMessage
        })
    } else {
        await lynae.sendMessage(chatId, { text: finalMessage })
    }
}

handler.help = ['ping', 'p']
handler.tags = ['info']
handler.command = /^(ping|p)$/i
handler.description = 'Display system information including OS, RAM, CPU, uptime, and bot ping/latency'

export default handler

