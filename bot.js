// bot.js - সম্পূর্ণ টেলিগ্রাম বট (photoFileId সাপোর্ট সহ)
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// ========================================
// ১. কনফিগারেশন
// ========================================

const TELEGRAM_TOKEN = '8801488172:AAHRtyt0PCcCijxGE7lu6Y_tzJt0kQflIhg';  // BotFather থেকে নিন

const LOGIN_URL = 'https://dhakapolytechnic.com/api/auth/sign-in/email';
const SEARCH_URL = 'https://dhakapolytechnic.com/api/students';
const FILE_API_URL = 'https://dhakapolytechnic.com/api/files';  // ফাইল এপিআই
const EMAIL = 'otsshamol@gmail.com';
const PASSWORD = 'oT$@2007';

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

    // ফাইল ডাউনলোডের জন্য নতুন মেথড
    async getFile(photoFileId) {
        if (!this.cookies || (new Date() - this.lastLogin) > 3600000) {
            console.log('🔄 ফাইলের জন্য রি-লগইন হচ্ছে...');
            if (!await this.login()) {
                return null;
            }
        }

        try {
            const response = await this.axiosInstance.get(
                `${FILE_API_URL}/${photoFileId}`,
                {
                    headers: {
                        'Cookie': this.cookies
                    },
                    responseType: 'stream'  // ফাইল স্ট্রিম হিসেবে
                }
            );

            if (response.status === 401) {
                console.log('🔄 ফাইলের জন্য কুকি এক্সপায়ার! রি-লগইন...');
                if (await this.login()) {
                    const retryResponse = await this.axiosInstance.get(
                        `${FILE_API_URL}/${photoFileId}`,
                        {
                            headers: {
                                'Cookie': this.cookies
                            },
                            responseType: 'stream'
                        }
                    );
                    if (retryResponse.status === 200) {
                        return retryResponse;
                    }
                }
                return null;
            }

            if (response.status === 200) {
                return response;
            }
            return null;
        } catch (error) {
            console.error('❌ ফাইল ডাউনলোড এরর:', error.message);
            return null;
        }
    }
}

const session = new SessionManager();

// ========================================
// ৪. ডেটা ফরম্যাটার
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
// ৫. টেলিগ্রাম বট
// ========================================

const bot = new Telegraf(TELEGRAM_TOKEN);

// ========== স্টার্ট কমান্ড ==========
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let user = getUser(userId);

    if (!user) {
        user = {
            total_searches: 0,
            joined: new Date().toISOString()
        };
        updateUser(userId, user);
    }

    await ctx.replyWithMarkdown(
        `🎓 **শিক্ষার্থী তথ্য অনুসন্ধান বট**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔍 আপনার রোল নম্বর পাঠান।\n` +
        `যেমন: \`240363\`\n\n` +
        `📊 **আপনার স্ট্যাটাস:**\n` +
        `• মোট সার্চ: ${user.total_searches || 0}\n\n` +
        `📸 ফটো সহ সম্পূর্ণ তথ্য পাবেন!`
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
        `• /about - বট সম্পর্কে\n` +
        `• /stats - আপনার পরিসংখ্যান\n\n` +
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
        `• ফটো সহ তথ্য (photoUrl/photoFileId)\n` +
        `• সম্পূর্ণ ফ্রি\n` +
        `• ২৪/৭ সক্রিয়\n\n` +
        `📌 **ডেভেলপার:** Oahid Towsif Shamol\n` +
        `📅 **সংস্করণ:** 3.1 (photoFileId সাপোর্ট)`
    );
});

// ========== স্ট্যাটস কমান্ড ==========
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    if (!user) {
        await ctx.reply('❌ আপনার প্রোফাইল পাওয়া যায়নি। /start দিন।');
        return;
    }

    await ctx.replyWithMarkdown(
        `📊 **আপনার পরিসংখ্যান**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📅 **জয়েন:** ${(user.joined || 'N/A').slice(0, 10)}\n` +
        `🔢 **মোট সার্চ:** ${user.total_searches || 0}\n\n` +
        `🎯 রোল নম্বর পাঠান নতুন সার্চ করতে।`
    );
});

// ========== ফটো পাঠানোর ফাংশন ==========
async function sendStudentPhoto(ctx, photoUrl, photoFileId, reply, roll, userId) {
    // ১. photoUrl থাকলে সরাসরি পাঠান
    if (photoUrl) {
        try {
            await ctx.replyWithPhoto(photoUrl, {
                caption: reply,
                parse_mode: 'Markdown'
            });
            console.log(`✅ ${roll} - photoUrl থেকে ফটো পাঠানো হয়েছে (ইউজার: ${userId})`);
            return true;
        } catch (error) {
            console.log(`⚠️ photoUrl থেকে ফটো পাঠাতে সমস্যা:`, error.message);
            // photoUrl কাজ না করলে photoFileId试试
            if (photoFileId) {
                console.log(`🔄 photoFileId দিয়ে চেষ্টা করা হচ্ছে...`);
                return await sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId);
            }
            return false;
        }
    }
    
    // ২. photoUrl না থাকলে photoFileId দিয়ে চেষ্টা
    if (photoFileId) {
        return await sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId);
    }
    
    return false;
}

// ========== photoFileId থেকে ফটো পাঠানো ==========
async function sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId) {
    try {
        // ফাইল ডাউনলোড
        const fileResponse = await session.getFile(photoFileId);
        
        if (!fileResponse) {
            console.log(`❌ photoFileId ডাউনলোড ব্যর্থ: ${photoFileId}`);
            return false;
        }

        // ফাইল স্ট্রিম থেকে buffer তৈরি
        const chunks = [];
        fileResponse.data.on('data', (chunk) => chunks.push(chunk));
        
        await new Promise((resolve, reject) => {
            fileResponse.data.on('end', resolve);
            fileResponse.data.on('error', reject);
        });

        const buffer = Buffer.concat(chunks);
        
        // ফটো পাঠান
        await ctx.replyWithPhoto(
            { source: buffer },
            {
                caption: reply,
                parse_mode: 'Markdown'
            }
        );
        
        console.log(`✅ ${roll} - photoFileId থেকে ফটো পাঠানো হয়েছে (ইউজার: ${userId})`);
        return true;
        
    } catch (error) {
        console.log(`❌ photoFileId থেকে ফটো পাঠাতে সমস্যা:`, error.message);
        return false;
    }
}

// ========== সার্চ হ্যান্ডলার ==========
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const roll = ctx.message.text.trim();

    // কমান্ড চেক
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
    const user = getUser(userId) || { total_searches: 0 };
    user.total_searches = (user.total_searches || 0) + 1;
    user.joined = user.joined || new Date().toISOString();
    updateUser(userId, user);

    // ডেটা প্রস্তুত
    const student = result.rows[0];
    const reply = formatStudentData(student);
    
    // ওয়েটিং মেসেজ ডিলিট
    await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);

    // ========== ফটো পাঠানোর চেষ্টা ==========
    const photoUrl = student.photoUrl;
    const photoFileId = student.photoFileId;
    
    const photoSent = await sendStudentPhoto(
        ctx, 
        photoUrl, 
        photoFileId, 
        reply, 
        roll, 
        userId
    );

    // ফটো না পাঠালে শুধু টেক্সট
    if (!photoSent) {
        await ctx.replyWithMarkdown(
            `📝 **তথ্য পাওয়া গেছে (ফটো ছাড়া)**\n\n${reply}`
        );
        console.log(`✅ ${roll} - শুধু টেক্সট পাঠানো হয়েছে (ইউজার: ${userId})`);
    }
});

// ========== এরর হ্যান্ডলার ==========
bot.catch((err, ctx) => {
    console.error('❌ বট এরর:', err);
    ctx.reply('⚠️ সার্ভার এরর! কিছুক্ষণ পর আবার চেষ্টা করুন।');
});

// ========================================
// ৬. বট স্টার্ট
// ========================================

console.log('🤖 বট চালু হচ্ছে...');
console.log('📸 photoUrl এবং photoFileId উভয় সাপোর্ট করা হবে।');

bot.launch()
    .then(() => {
        console.log('✅ বট রেডি! টেলিগ্রামে /start দিন');
    })
    .catch((error) => {
        console.error('❌ বট লঞ্চ করতে সমস্যা:', error);
    });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));