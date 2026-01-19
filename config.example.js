// Bot Configuration
export const config = {
    // Bot Name
    botName: 'Lynae-MD',
    
    // Bot Number (for pairing - leave empty to input manually when bot starts)
    // Format: +6281234567890 or 6281234567890 (with or without +)
    botNumber: '', // Example: '+6281234567890' or leave empty to input manually
    
    // Bot Owner (can add multiple owners)
    owner: [
        '6281234567890@s.whatsapp.net', // Owner 1 (replace with your number)
    ],
    
    // Sticker Configuration
    sticker: {
        // Sticker pack name
        packName: 'LynaeBot',
        // Sticker author
        packAuthor: 'vtx.my.id',
        // Sticker categories (optional)
        categories: ['Fun', 'Custom']
    },
    
    // Genius API Configuration (for lyrics command)
    geniusApiKey: '', // Get your API Key at https://genius.com/api-clients
    
    // Bot Bio
    bio: '🤖 Lynae-MD Bot\n\nA powerful WhatsApp bot built with Baileys\n\nType .help for commands'
}

// Helper function to get owner numbers (without @s.whatsapp.net)
export function getOwnerNumbers() {
    return config.owner.map(owner => owner.split('@')[0])
}

// Helper function to check if user is owner
export function isOwner(jid) {
    if (!jid) return false
    const userJid = jid.includes('@') ? jid : jid + '@s.whatsapp.net'
    return config.owner.includes(userJid)
}

// Helper function to format bot number for sticker author
export function getBotAuthor(botNumber) {
    const number = botNumber ? botNumber.split('@')[0] : 'Unknown'
    return `${config.botName} | ${number}`
}