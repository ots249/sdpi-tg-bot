// bot.js - সম্পূর্ণ টেলিগ্রাম বট (Node.js)
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// ========================================
// ১. কনফিগারেশন
// ========================================

const TELEGRAM_TOKEN = '8801488172:AAHRtyt0PCcCijxGE7lu6Y_tzJt0kQflIhg';  // BotFather থেকে নিন

const LOGIN_URL = 'https://dhakapolytechnic.com/api/auth/sign-in/email';
const SEARCH_URL = 'https://dhakapolytechnic.com/api/students';
const EMAIL = 'otsshamol@gmail.com';
const PASSWORD = 'oT$@2007';

const DAILY_FREE_SEARCH = 5;
const USERS_FILE = 'users.json';

// ========================================
// ২. ডেটাবেস (JSON ফাইল)
// ========================================

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('❌ ইউজার লোড করতে সমস্যা:', error);
        return {};
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('❌ ইউজার সেভ করতে সমস্যা:', error);
    }
}

function getUser(userId) {
    const users = loadUsers();
    return users[userId] || null;
}

function updateUser(userId, data) {
    const users = loadUsers();
    users[userId] = data;
    saveUsers(users);
}

// ========================================
// ৩. সেশন ম্যানেজার
// ========================================

class SessionManager {
    constructor() {
        this.cookies = null;
        this.lastLogin = null;
        this.axiosInstance = axios.create({
            timeout: 30000,
            withCredentials: true
        });
    }

    async login() {
        try {
            const response = await this.axiosInstance.post(LOGIN_URL, {
                email: EMAIL,
                password: PASSWORD
            });

            if (response.status === 200) {
                // কুকি সংগ্রহ
                const cookies = response.headers['set-cookie'];
                if (cookies) {
                    this.cookies = cookies.join('; ');
                    this.lastLogin = new Date();
                    console.log('✅ লগইন সফল!');
                    return true;
                }
            }
            console.log('❌ লগইন ব্যর্থ:', response.status);
            return false;
        } catch (error) {
            console.error('❌ লগইন এরর:', error.message);
            return false;
        }
    }

    async searchStudent(roll) {
        // কুকি নেই বা ১ ঘণ্টা পার হলে রি-লগইন
        if (!this.cookies || (new Date() - this.lastLogin) > 3600000) {
            console.log('🔄 রি-লগইন হচ্ছে...');
            if (!await this.login()) {
                return null;
            }
        }

        try {
            const response = await this.axiosInstance.get(
                `${SEARCH_URL}?search=${roll}`,
                {
                    headers: {
                        'Cookie': this.cookies
                    }
                }
            );

            // কুকি এক্সপায়ার হলে রি-লগইন
            if (response.status === 401) {
                console.log('🔄 কুকি এক্সপায়ার! রি-লগইন...');
                if (await this.login()) {
                    const retryResponse = await this.axiosInstance.get(
                        `${SEARCH_URL}?search=${roll}`,
                        {
                            headers: {
                                'Cookie': this.cookies
                            }
                        }
                    );
                    if (retryResponse.status === 200) {
                        return retryResponse.data;
                    }
                }
                return null;
            }

            if (response.status === 200) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.error('❌ সার্চ এরর:', error.message);
            return null;
        }
    }
}

// গ্লোবাল সেশন
const session = new SessionManager();

// ========================================
// ৪. প্রিমিয়াম চেকার
// ========================================

function isPremium(userId) {
    const user = getUser(userId);
    if (!user || !user.premium) return false;

    // এক্সপায়ারি চেক
    if (user.expiry) {
        const expiryDate = new Date(user.expiry);
        if (expiryDate < new Date()) {
            user.premium = false;
            updateUser(userId, user);
            return false;
        }
    }
    return true;
}

function canSearch(userId) {
    if (isPremium(userId)) return true;

    const user = getUser(userId);
    const today = new Date().toISOString().split('T')[0];

    // আজকের ডেটা রিসেট
    if (!user || user.date !== today) {
        updateUser(userId, {
            ...user,
            date: today,
            daily_count: 0
        });
        return true;
    }

    return (user.daily_count || 0) < DAILY_FREE_SEARCH;
}

function incrementSearch(userId) {
    const user = getUser(userId) || { total_searches: 0 };
    const today = new Date().toISOString().split('T')[0];

    if (user.date !== today) {
        user.date = today;
        user.daily_count = 0;
    }

    user.daily_count = (user.daily_count || 0) + 1;
    user.total_searches = (user.total_searches || 0) + 1;
    user.joined = user.joined || new Date().toISOString();

    updateUser(userId, user);
}

// ========================================
// ৫. ডেটা ফরম্যাটার
// ========================================

function formatStudentData(student) {
    let reply = '🎓 **শিক্ষার্থীর তথ্য**\n';
    reply += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    reply += `👤 **নাম (বাংলা):** ${student.nameBn || 'N/A'}\n`;
    reply += `👤 **নাম (ইংরেজি):** ${student.name || 'N/A'}\n`;
    reply += `🔢 **রোল:** ${student.roll || 'N/A'}\n`;
    reply += `📋 **রেজি:** ${student.reg || 'N/A'}\n`;
    reply += `📚 **বিভাগ:** ${student.dept || 'N/A'}\n`;
    reply += `🕐 **শিফট:** ${student.shift || 'N/A'}\n`;
    reply += `📅 **সেশন:** ${student.session || 'N/A'}\n\n`;

    reply += `👨‍👦 **পিতা:** ${student.fatherBn || 'N/A'}\n`;
    reply += `👩‍👦 **মাতা:** ${student.motherBn || 'N/A'}\n\n`;

    reply += `🩸 **ব্লাড গ্রুপ:** ${student.bloodGroup || 'N/A'}\n`;
    reply += `📱 **মোবাইল:** ${student.mobile || 'N/A'}\n`;
    reply += `📞 **গার্ডিয়ান:** ${student.guardianMobile || 'N/A'}\n\n`;

    reply += `🏠 **ঠিকানা:**\n`;
    reply += `গ্রাম: ${student.village || 'N/A'}\n`;
    reply += `পোস্ট: ${student.post || 'N/A'}\n`;
    reply += `উপজেলা: ${student.upazila || 'N/A'}\n`;
    reply += `জেলা: ${student.district || 'N/A'}\n`;

    reply += `\n📌 **স্ট্যাটাস:** ${student.status || 'N/A'}`;

    return reply;
}

// ========================================
// ৬. টেলিগ্রাম বট
// ========================================

const bot = new Telegraf(TELEGRAM_TOKEN);

// ========== স্টার্ট কমান্ড ==========
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let user = getUser(userId);

    if (!user) {
        user = {
            premium: false,
            daily_count: 0,
            total_searches: 0,
            joined: new Date().toISOString()
        };
        updateUser(userId, user);
    }

    const premiumStatus = isPremium(userId) ? '✅ হ্যাঁ' : '❌ না';
    const dailyCount = user.daily_count || 0;

    await ctx.replyWithMarkdown(
        `🎓 **শিক্ষার্থী তথ্য অনুসন্ধান বট**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔍 আপনার রোল নম্বর পাঠান।\n` +
        `যেমন: \`240363\`\n\n` +
        `📊 **আপনার স্ট্যাটাস:**\n` +
        `• প্রিমিয়াম: ${premiumStatus}\n` +
        `• আজকের সার্চ: ${dailyCount}/${DAILY_FREE_SEARCH}\n` +
        `• মোট সার্চ: ${user.total_searches || 0}\n\n` +
        `💰 প্রিমিয়াম নিতে /premium দিন।`
    );
});

// ========== হেল্প কমান্ড ==========
bot.help(async (ctx) => {
    await ctx.replyWithMarkdown(
        `📖 **কীভাবে ব্যবহার করবেন:**\n\n` +
        `1️⃣ /start - বট চালু করুন\n` +
        `2️⃣ আপনার রোল নম্বর পাঠান (যেমন: \`240363\`)\n` +
        `3️⃣ বট তথ্য খুঁজে দেবে\n\n` +
        `⚡ **অন্যান্য কমান্ড:**\n` +
        `• /premium - প্রিমিয়াম তথ্য\n` +
        `• /profile - আপনার প্রোফাইল\n` +
        `• /about - বট সম্পর্কে\n\n` +
        `📸 ফটো সহ তথ্য পাবেন!`
    );
});

// ========== অ্যাবাউট কমান্ড ==========
bot.command('about', async (ctx) => {
    await ctx.replyWithMarkdown(
        `🤖 **বট সম্পর্কে:**\n\n` +
        `ঢাকা পলিটেকনিক ইনস্টিটিউটের\n` +
        `শিক্ষার্থীদের তথ্য অনুসন্ধান বট।\n\n` +
        `⚡ **বৈশিষ্ট্য:**\n` +
        `• রোল দিয়ে দ্রুত খোঁজ\n` +
        `• ফটো সহ তথ্য\n` +
        `• দৈনিক ৫টি ফ্রি সার্চ\n` +
        `• প্রিমিয়াম: আনলিমিটেড\n\n` +
        `📌 **ডেভেলপার:** Oahid Towsif Shamol\n` +
        `📅 **সংস্করণ:** 2.0`
    );
});

// ========== প্রিমিয়াম কমান্ড ==========
bot.command('premium', async (ctx) => {
    const userId = ctx.from.id;

    if (isPremium(userId)) {
        const user = getUser(userId);
        await ctx.replyWithMarkdown(
            `✅ **আপনি প্রিমিয়াম ইউজার!**\n\n` +
            `📅 মেয়াদ: ${user.expiry || 'N/A'}\n` +
            `🔓 সব ফিচার আনলিমিটেড\n\n` +
            `আপনার রোল নম্বর পাঠান।`
        );
    } else {
        await ctx.replyWithMarkdown(
            `💎 **প্রিমিয়াম সাবস্ক্রিপশন**\n\n` +
            `✨ **প্রিমিয়াম ফিচারসমূহ:**\n` +
            `• ♾️ আনলিমিটেড সার্চ\n` +
            `• 📊 এক্সেল রিপোর্ট\n` +
            `• 📋 বাল্ক সার্চ\n` +
            `• 🚀 দ্রুততম স্পিড\n\n` +
            `💰 **মূল্য:** $10/মাস\n\n` +
            `📲 পেমেন্ট করতে: \`payment@example.com\`\n` +
            `এ ইমেইলে যোগাযোগ করুন।`
        );
    }
});

// ========== প্রোফাইল কমান্ড ==========
bot.command('profile', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    if (!user) {
        await ctx.reply('❌ আপনার প্রোফাইল পাওয়া যায়নি। /start দিন।');
        return;
    }

    const status = isPremium(userId) ? '✅ প্রিমিয়াম' : '❌ ফ্রি';
    const expiry = user.expiry || 'N/A';

    await ctx.replyWithMarkdown(
        `👤 **আপনার প্রোফাইল**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📊 **স্ট্যাটাস:** ${status}\n` +
        `📅 **জয়েন:** ${(user.joined || 'N/A').slice(0, 10)}\n` +
        `🔢 **মোট সার্চ:** ${user.total_searches || 0}\n` +
        `📆 **আজকের সার্চ:** ${user.daily_count || 0}/${DAILY_FREE_SEARCH}\n` +
        `⏳ **মেয়াদ:** ${expiry}\n\n` +
        `💳 প্রিমিয়াম নিতে /premium দিন।`
    );
});

// ========== সার্চ হ্যান্ডলার ==========
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const roll = ctx.message.text.trim();

    // কমান্ড চেক (পুনরায়)
    if (roll.startsWith('/')) return;

    // ভ্যালিডেশন
    if (!/^\d{6}$/.test(roll)) {
        await ctx.replyWithMarkdown(
            `❌ **ভুল রোল নম্বর!**\n\n` +
            `রোল নম্বর ৬ ডিজিটের হয়।\n` +
            `যেমন: \`240363\`\n\n` +
            `আবার চেষ্টা করুন।`
        );
        return;
    }

    // ফ্রি সার্চ লিমিট চেক
    if (!canSearch(userId)) {
        const user = getUser(userId);
        await ctx.replyWithMarkdown(
            `⚠️ **দৈনিক সার্চ লিমিট শেষ!**\n\n` +
            `আজ আপনি ${user.daily_count}/${DAILY_FREE_SEARCH}টি সার্চ করেছেন।\n\n` +
            `💎 **প্রিমিয়াম নিলে আনলিমিটেড সার্চ পাবেন!**\n` +
            `/premium দিন বিস্তারিত জানতে।`
        );
        return;
    }

    // ওয়েটিং মেসেজ
    const waitingMsg = await ctx.replyWithMarkdown(
        `⏳ **অনুসন্ধান করা হচ্ছে...**\n` +
        `🎯 রোল: \`${roll}\``
    );

    // সার্চ করুন
    const result = await session.searchStudent(roll);

    if (!result || !result.rows || result.rows.length === 0) {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            waitingMsg.message_id,
            null,
            `❌ **শিক্ষার্থী পাওয়া যায়নি!**\n\n` +
            `রোল: \`${roll}\`\n\n` +
            `💡 চেক করুন:\n` +
            `• রোল নম্বর সঠিক কিনা\n` +
            `• রোলটি বিদ্যমান কিনা`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // সার্চ কাউন্ট বাড়ান
    incrementSearch(userId);

    // ডেটা প্রস্তুত
    const student = result.rows[0];
    const reply = formatStudentData(student);
    const photoUrl = student.photoUrl;

    // ফটো সহ পাঠান
    if (photoUrl) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);
            await ctx.replyWithPhoto(photoUrl, {
                caption: reply,
                parse_mode: 'Markdown'
            });
            console.log(`✅ ${roll} - ফটো সহ পাঠানো হয়েছে (ইউজার: ${userId})`);
        } catch (error) {
            console.log(`⚠️ ফটো এরর:`, error.message);
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                waitingMsg.message_id,
                null,
                `⚠️ ফটো লোড করতে সমস্যা!\n\n${reply}`,
                { parse_mode: 'Markdown' }
            );
        }
    } else {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            waitingMsg.message_id,
            null,
            reply,
            { parse_mode: 'Markdown' }
        );
        console.log(`✅ ${roll} - টেক্সট পাঠানো হয়েছে (ইউজার: ${userId})`);
    }
});

// ========== এরর হ্যান্ডলার ==========
bot.catch((err, ctx) => {
    console.error('❌ বট এরর:', err);
    ctx.reply('⚠️ সার্ভার এরর! কিছুক্ষণ পর আবার চেষ্টা করুন।');
});

// ========================================
// ৭. বট স্টার্ট
// ========================================

console.log('🤖 বট চালু হচ্ছে...');
bot.launch()
    .then(() => {
        console.log('✅ বট রেডি! টেলিগ্রামে /start দিন');
    })
    .catch((error) => {
        console.error('❌ বট লঞ্চ করতে সমস্যা:', error);
    });

// গ্রেসফুল শাটডাউন
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));