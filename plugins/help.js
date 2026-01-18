import { media, config } from '../lynae.js'

const handler = async (m, { lynae, usedPrefix, command, plugins }) => {
    // Parse arguments
    const args = m.text.split(' ').slice(1)
    const input = args[0]?.toLowerCase()
    
    // Collect Categories and Commands
    const categories = {}
    plugins.forEach(plugin => {
        if (plugin.tags && plugin.help && plugin.help.length > 0) {
            const mainCommand = plugin.help[0].split(' ')[0]
            plugin.tags.forEach(tag => {
                if (!categories[tag]) categories[tag] = []
                if (!categories[tag].includes(mainCommand)) categories[tag].push(mainCommand)
            })
        }
    })
    const sortedCategories = Object.keys(categories).sort()
    
    // Helper function to send message
    const sendMsg = async (content) => {
        const chatId = m.chat || m.sender
        await lynae.sendPresenceUpdate('composing', chatId)
        await new Promise(resolve => setTimeout(resolve, 1000))
        await lynae.sendPresenceUpdate('available', chatId)
        
        if (media.banner && content.image === undefined && !content.sections) {
            content.image = media.banner
            content.caption = content.text
            delete content.text
        }
        
        await lynae.sendMessage(chatId, content, { quoted: m })
    }

    // CASE 1: .help <category> or .help <command>
    if (input) {
        // Check if input is a Category
        const categoryName = sortedCategories.find(c => c.toLowerCase() === input)
        if (categoryName) {
            const commands = categories[categoryName]
            const displayCat = categoryName.charAt(0).toUpperCase() + categoryName.slice(1)
            let catText = `╭───「 *${displayCat} Menu* 」\n`
            commands.forEach(cmd => {
                catText += `│ • ${usedPrefix}${cmd}\n`
            })
            catText += `╰──────────────`
            
            await sendMsg({ text: catText })
            return
        }

        // Check if input is a Command
        let foundPlugin = null
        for (const plugin of plugins) {
            if (plugin.help && plugin.help.some(cmd => cmd.split(' ')[0].toLowerCase() === input)) {
                foundPlugin = plugin
                break
            }
        }

        if (foundPlugin) {
            const mainCommand = foundPlugin.help[0]
            const aliases = foundPlugin.help.slice(1)
            const category = foundPlugin.tags?.[0] || 'unknown'
            const description = foundPlugin.description || 'No description available'
            
            let detailText = `╭───「 *COMMAND INFO* 」
│
│ 📝 *Command:* ${usedPrefix}${mainCommand.split(' ')[0]}
│ 📁 *Category:* ${category.charAt(0).toUpperCase() + category.slice(1)}
│ 💡 *Description:* ${description}
│ 🔗 *Usage:* ${usedPrefix}${mainCommand}
│
│ 🖇️ *Aliases:* ${aliases.length > 0 ? aliases.map(a => a.split(' ')[0]).join(', ') : 'None'}
│
╰──────────────`
            
            await sendMsg({ text: detailText })
            return
        }
        
        // Not found
        await lynae.sendMessage(m.chat, { text: `❌ Category or Command "${input}" not found.` }, { quoted: m })
        return
    }

    // CASE 2: Main Menu (Show All Commands)
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })
    const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    
    let menuText = `╭───「 *${config.botName}* 」
│
│ 👋 *Hi ${m.pushName || 'User'}!*
│ 🤖 *Bot Name:* ${config.botName}
│ 📅 *Date:* ${date}
│ ⏰ *Time:* ${time}
│ 🚀 *Prefix:* [ ${usedPrefix} ]
│
╰────────────────\n\n`

    sortedCategories.forEach(category => {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1)
        const commands = categories[category]
        
        menuText += `╭───「 *${categoryName}* 」\n`
        commands.forEach(cmd => {
            menuText += `│ • ${usedPrefix}${cmd}\n`
        })
        menuText += `╰──────────────\n\n`
    })
    
    menuText += `_Use ${usedPrefix}help <command> for details_`

    await sendMsg({ text: menuText })
}

handler.help = ['help', 'menu', '?']
handler.tags = ['main']
handler.command = /^(help|menu|\?)(\s+.+)?$/i
handler.description = 'Display command menu'

export default handler
