// bot.js - সম্পূর্ণ টেলিগ্রাম বট (অ্যাডমিন প্যানেল + রেজাল্ট সহ)
require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// ========================================
// ১. কনফিগারেশন (ENV থেকে)
// ========================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8801488172:AAFPwi17tgFalw0u56Jf5O24YEVH3KBdKsc';
const ADMIN_IDS = (process.env.ADMIN_IDS || '8279612640').split(',').map(id => id.trim());

// এপিআই ইউআরএল
const LOGIN_URL = process.env.LOGIN_URL || 'https://dhakapolytechnic.com/api/auth/sign-in/email';
const SEARCH_URL = process.env.SEARCH_URL || 'https://dhakapolytechnic.com/api/students';
const FILE_API_URL = process.env.FILE_API_URL || 'https://dhakapolytechnic.com/api/files';
const RESULT_API_URL = process.env.RESULT_API_URL || 'https://btebresultszone.com/api/student-results';

const EMAIL = process.env.EMAIL || 'otsshamol@gmail.com';
const PASSWORD = process.env.PASSWORD || 'oT$@2007';

const USERS_FILE = 'users.json';
const HISTORY_FILE = 'history.json';
const SETTINGS_FILE = 'settings.json';

// ========================================
// ২. ডেটাবেস ফাংশন
// ========================================

function loadJSON(file) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error(`❌ ${file} লোড করতে সমস্যা:`, error);
        return {};
    }
}

function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`❌ ${file} সেভ করতে সমস্যা:`, error);
    }
}

function getUsers() { return loadJSON(USERS_FILE); }
function saveUsers(users) { saveJSON(USERS_FILE, users); }
function getUser(userId) { return getUsers()[userId] || null; }
function updateUser(userId, data) {
    const users = getUsers();
    users[userId] = data;
    saveUsers(users);
}

function getHistory() { return loadJSON(HISTORY_FILE); }
function saveHistory(history) { saveJSON(HISTORY_FILE, history); }
function addHistory(userId, roll, result, studentInfo = null) {
    const history = getHistory();
    if (!history[userId]) history[userId] = [];
    history[userId].push({
        roll: roll,
        timestamp: new Date().toISOString(),
        result: result ? 'found' : 'not_found',
        studentInfo: studentInfo
    });
    if (history[userId].length > 100) {
        history[userId] = history[userId].slice(-100);
    }
    saveHistory(history);
}

function getSettings() { return loadJSON(SETTINGS_FILE); }
function saveSettings(settings) { saveJSON(SETTINGS_FILE, settings); }

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
            if (!await this.login()) return null;
        }

        try {
            const response = await this.axiosInstance.get(
                `${SEARCH_URL}?search=${roll}`,
                { headers: { 'Cookie': this.cookies } }
            );
            if (response.status === 401) {
                console.log('🔄 কুকি এক্সপায়ার! রি-লগইন...');
                if (await this.login()) {
                    const retryResponse = await this.axiosInstance.get(
                        `${SEARCH_URL}?search=${roll}`,
                        { headers: { 'Cookie': this.cookies } }
                    );
                    if (retryResponse.status === 200) return retryResponse.data;
                }
                return null;
            }
            if (response.status === 200) return response.data;
            return null;
        } catch (error) {
            console.error('❌ সার্চ এরর:', error.message);
            return null;
        }
    }

    async getFile(photoFileId) {
        if (!this.cookies || (new Date() - this.lastLogin) > 3600000) {
            if (!await this.login()) return null;
        }
        try {
            const response = await this.axiosInstance.get(
                `${FILE_API_URL}/${photoFileId}`,
                {
                    headers: { 'Cookie': this.cookies },
                    responseType: 'stream'
                }
            );
            if (response.status === 401) {
                if (await this.login()) {
                    const retryResponse = await this.axiosInstance.get(
                        `${FILE_API_URL}/${photoFileId}`,
                        {
                            headers: { 'Cookie': this.cookies },
                            responseType: 'stream'
                        }
                    );
                    if (retryResponse.status === 200) return retryResponse;
                }
                return null;
            }
            if (response.status === 200) return response;
            return null;
        } catch (error) {
            console.error('❌ ফাইল ডাউনলোড এরর:', error.message);
            return null;
        }
    }

    // রেজাল্ট চেক করার জন্য নতুন মেথড
    async getResult(roll) {
        try {
            const response = await this.axiosInstance.get(
                `${RESULT_API_URL}?roll=${roll}&curriculumId=diploma_in_engineering`
            );
            if (response.status === 200 && response.data.success) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.error('❌ রেজাল্ট এরর:', error.message);
            return null;
        }
    }
}

const session = new SessionManager();

// ========================================
// ৪. ইউটিলিটি ফাংশন
// ========================================

function isAdmin(userId) {
    return ADMIN_IDS.includes(String(userId));
}

// স্টুডেন্ট ডেটা ফরম্যাট
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

// রেজাল্ট ফরম্যাট করার ফাংশন
function formatResultData(resultData, roll) {
    if (!resultData || !resultData.data || resultData.data.length === 0) {
        return null;
    }

    const studentData = resultData.data[0];
    let reply = '📊 **শিক্ষার্থীর ফলাফল**\n';
    reply += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    reply += `🔢 **রোল:** ${studentData.roll || 'N/A'}\n`;
    reply += `🏫 **ইনস্টিটিউট:** ${studentData.institute?.name || 'N/A'}\n`;
    reply += `📚 **কারিকুলাম:** ${studentData.curriculumId || 'N/A'}\n`;
    reply += `📅 **রেগুলেশন:** ${studentData.regulation || 'N/A'}\n\n`;

    // লেটেস্ট রেজাল্ট
    if (studentData.latestResults && studentData.latestResults.length > 0) {
        reply += '📈 **সর্বশেষ ফলাফল:**\n';
        reply += '━━━━━━━━━━━━━━━━━━━━\n';
        
        const sortedResults = [...studentData.latestResults].sort((a, b) => a.semester - b.semester);
        
        for (const result of sortedResults) {
            const semesterNum = result.semester;
            const gpa = result.gpa || 0;
            const status = semesterNum <= Object.keys(studentData.semesterResults || {}).length ? 
                'পাস ✅' : 'ফেল ❌';
            
            reply += `📘 **সেমিস্টার ${semesterNum}:**\n`;
            reply += `   • GPA: ${gpa.toFixed(2)}\n`;
            reply += `   • স্ট্যাটাস: ${status}\n`;
            reply += `   • তারিখ: ${new Date(result.date).toLocaleDateString('bn-BD')}\n`;
            reply += `   • ফাইল: ${result.fileName || 'N/A'}\n\n`;
        }
    }

    // সামগ্রিক অবস্থা
    reply += '📊 **সামগ্রিক অবস্থা:**\n';
    reply += '━━━━━━━━━━━━━━━━━━━━\n';
    
    let totalSemesters = 0;
    let passedSemesters = 0;
    
    if (studentData.semesterResults) {
        for (const semesterResult of studentData.semesterResults) {
            totalSemesters++;
            if (semesterResult.status === 'passed') {
                passedSemesters++;
            }
        }
    }
    
    if (totalSemesters > 0) {
        reply += `• মোট সেমিস্টার: ${totalSemesters}\n`;
        reply += `• পাস করা: ${passedSemesters}\n`;
        reply += `• ফেল করা: ${totalSemesters - passedSemesters}\n`;
        
        let totalGpa = 0;
        let gpaCount = 0;
        if (studentData.latestResults) {
            for (const result of studentData.latestResults) {
                if (result.gpa) {
                    totalGpa += result.gpa;
                    gpaCount++;
                }
            }
        }
        if (gpaCount > 0) {
            const cgpa = totalGpa / gpaCount;
            reply += `• সিজিপিএ: ${cgpa.toFixed(2)}\n`;
        }
    }

    return reply;
}

// ========================================
// ৫. ফটো পাঠানোর ফাংশন
// ========================================

async function sendStudentPhoto(ctx, photoUrl, photoFileId, reply, roll, userId) {
    if (photoUrl) {
        try {
            await ctx.replyWithPhoto(photoUrl, {
                caption: reply,
                parse_mode: 'Markdown'
            });
            console.log(`✅ ${roll} - photoUrl থেকে ফটো পাঠানো হয়েছে`);
            return true;
        } catch (error) {
            console.log(`⚠️ photoUrl থেকে সমস্যা:`, error.message);
            if (photoFileId) {
                console.log(`🔄 photoFileId দিয়ে চেষ্টা...`);
                return await sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId);
            }
            return false;
        }
    }
    if (photoFileId) {
        return await sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId);
    }
    return false;
}

async function sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId) {
    try {
        const fileResponse = await session.getFile(photoFileId);
        if (!fileResponse) return false;
        const chunks = [];
        fileResponse.data.on('data', (chunk) => chunks.push(chunk));
        await new Promise((resolve, reject) => {
            fileResponse.data.on('end', resolve);
            fileResponse.data.on('error', reject);
        });
        const buffer = Buffer.concat(chunks);
        await ctx.replyWithPhoto(
            { source: buffer },
            { caption: reply, parse_mode: 'Markdown' }
        );
        console.log(`✅ ${roll} - photoFileId থেকে ফটো পাঠানো হয়েছে`);
        return true;
    } catch (error) {
        console.log(`❌ photoFileId থেকে সমস্যা:`, error.message);
        return false;
    }
}

// ========================================
// ৬. টেলিগ্রাম বট
// ========================================

const bot = new Telegraf(TELEGRAM_TOKEN);

// ========== অ্যাডমিন মিডলওয়্যার ==========
async function adminOnly(ctx, next) {
    try {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('⛔ এই কমান্ড শুধু অ্যাডমিনদের জন্য।');
            return;
        }
        await next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        await ctx.reply('⚠️ অ্যাডমিন চেক করতে সমস্যা হয়েছে।');
    }
}

// ========================================
// ৬.এ ইউজার কমান্ড
// ========================================

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
    const isAdminUser = isAdmin(userId);
    await ctx.replyWithMarkdown(
        `🎓 **শিক্ষার্থী তথ্য অনুসন্ধান বট**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔍 আপনার রোল নম্বর পাঠান।\n` +
        `যেমন: \`240363\` অথবা \`2403631\`\n\n` +
        `📊 **আপনার স্ট্যাটাস:**\n` +
        `• মোট সার্চ: ${user.total_searches || 0}\n` +
        `${isAdminUser ? '• 👑 অ্যাডমিন' : ''}\n\n` +
        `📸 ফটো সহ সম্পূর্ণ তথ্য পাবেন!` +
        `${isAdminUser ? '\n\n/admin - অ্যাডমিন প্যানেল' : ''}`
    );
});

bot.help(async (ctx) => {
    const isAdminUser = isAdmin(ctx.from.id);
    let help = `📖 **কীভাবে ব্যবহার করবেন:**\n\n` +
        `1️⃣ /start - বট চালু করুন\n` +
        `2️⃣ আপনার রোল নম্বর পাঠান\n` +
        `3️⃣ বট তথ্য খুঁজে দেবে\n\n` +
        `⚡ **কমান্ড:**\n` +
        `• /about - বট সম্পর্কে\n` +
        `• /stats - আপনার পরিসংখ্যান`;
    if (isAdminUser) {
        help += `\n\n👑 **অ্যাডমিন কমান্ড:**\n` +
            `• /admin - অ্যাডমিন প্যানেল\n` +
            `• /broadcast - ব্রডকাস্ট মেসেজ\n` +
            `• /users - ইউজার লিস্ট\n` +
            `• /stats_all - সব পরিসংখ্যান\n` +
            `• /history [userId] - ইউজার হিস্ট্রি`;
    }
    await ctx.replyWithMarkdown(help);
});

bot.command('about', async (ctx) => {
    await ctx.replyWithMarkdown(
        `🤖 **বট সম্পর্কে:**\n\n` +
        `ঢাকা পলিটেকনিক ইনস্টিটিউটের\n` +
        `শিক্ষার্থীদের তথ্য অনুসন্ধান বট।\n\n` +
        `⚡ **বৈশিষ্ট্য:**\n` +
        `• রোল দিয়ে দ্রুত খোঁজ\n` +
        `• ফটো সহ তথ্য\n` +
        `• রেজাল্ট চেক\n` +
        `• সম্পূর্ণ ফ্রি\n` +
        `• ২৪/৭ সক্রিয়\n` +
        `• অ্যাডমিন প্যানেল\n\n` +
        `📌 **ডেভেলপার:** Oahid Towsif Shamol\n` +
        `📅 **সংস্করণ:** 5.0 (রেজাল্ট সহ)`
    );
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    if (!user) {
        await ctx.reply('❌ প্রোফাইল পাওয়া যায়নি। /start দিন।');
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

// ========================================
// ৬.বি অ্যাডমিন কমান্ড
// ========================================

// অ্যাডমিন প্যানেল
bot.command('admin', adminOnly, async (ctx) => {
    try {
        const users = getUsers();
        const history = getHistory();
        const totalUsers = Object.keys(users).length;
        let totalSearches = 0;
        Object.values(users).forEach(u => {
            totalSearches += (u.total_searches || 0);
        });

        await ctx.replyWithMarkdown(
            `👑 **অ্যাডমিন প্যানেল**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📊 **পরিসংখ্যান:**\n` +
            `• মোট ইউজার: ${totalUsers}\n` +
            `• মোট সার্চ: ${totalSearches}\n` +
            `• অ্যাক্টিভ ইউজার: ${Object.keys(history).length}\n\n` +
            `⚡ **কমান্ড:**\n` +
            `• /broadcast - ব্রডকাস্ট মেসেজ\n` +
            `• /users - ইউজার লিস্ট\n` +
            `• /stats_all - সব পরিসংখ্যান\n` +
            `• /history [userId] - ইউজার হিস্ট্রি\n` +
            `• /clear_history [userId] - হিস্ট্রি ক্লিয়ার\n` +
            `• /delete_user [userId] - ইউজার ডিলিট\n\n` +
            `💡 ব্যবহার: /history 123456789`
        );
    } catch (error) {
        console.error('Admin panel error:', error);
        await ctx.reply('⚠️ অ্যাডমিন প্যানেল লোড করতে সমস্যা হয়েছে।');
    }
});

// ব্রডকাস্ট
bot.command('broadcast', adminOnly, async (ctx) => {
    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) {
        await ctx.reply('📢 **ব্রডকাস্ট মেসেজ পাঠান:**\n\n`/broadcast আপনার মেসেজ`');
        return;
    }

    const users = getUsers();
    const userIds = Object.keys(users);
    let sent = 0, failed = 0;

    const statusMsg = await ctx.reply(`⏳ ${userIds.length} জন ইউজারকে মেসেজ পাঠানো হচ্ছে...`);

    for (const userId of userIds) {
        try {
            await ctx.telegram.sendMessage(userId, 
                `📢 **অ্যাডমিন থেকে বার্তা:**\n\n${message}`
            );
            sent++;
        } catch (error) {
            failed++;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        `✅ **ব্রডকাস্ট সম্পন্ন!**\n\n` +
        `📤 সফল: ${sent}\n` +
        `❌ ব্যর্থ: ${failed}\n` +
        `👥 মোট: ${userIds.length}`
    );
});

// ইউজার লিস্ট
bot.command('users', adminOnly, async (ctx) => {
    const users = getUsers();
    const userIds = Object.keys(users);
    
    if (userIds.length === 0) {
        await ctx.reply('📭 কোনো ইউজার নেই।');
        return;
    }

    let reply = `👥 **ইউজার লিস্ট**\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    const recentUsers = userIds.slice(-20);
    
    for (const id of recentUsers) {
        const user = users[id];
        const name = user.name || 'Unknown';
        const searches = user.total_searches || 0;
        reply += `🆔 ${id}\n`;
        reply += `👤 ${name}\n`;
        reply += `🔢 ${searches} সার্চ\n`;
        reply += `📅 ${(user.joined || 'N/A').slice(0, 10)}\n\n`;
    }

    reply += `📊 মোট: ${userIds.length} জন ইউজার`;
    await ctx.replyWithMarkdown(reply);
});

// সব পরিসংখ্যান
bot.command('stats_all', adminOnly, async (ctx) => {
    const users = getUsers();
    const history = getHistory();
    const totalUsers = Object.keys(users).length;
    let totalSearches = 0;
    let activeUsers = 0;

    Object.values(users).forEach(u => {
        totalSearches += (u.total_searches || 0);
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    for (const [userId, histories] of Object.entries(history)) {
        const recent = histories.filter(h => new Date(h.timestamp) > sevenDaysAgo);
        if (recent.length > 0) activeUsers++;
    }

    await ctx.replyWithMarkdown(
        `📊 **সম্পূর্ণ পরিসংখ্যান**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👥 **ইউজার:**\n` +
        `• মোট: ${totalUsers}\n` +
        `• গত ৭ দিনে সক্রিয়: ${activeUsers}\n\n` +
        `🔍 **সার্চ:**\n` +
        `• মোট: ${totalSearches}\n` +
        `• গড়/ইউজার: ${totalUsers > 0 ? (totalSearches/totalUsers).toFixed(1) : 0}\n\n` +
        `📈 **অ্যাক্টিভিটি:**\n` +
        `• মোট হিস্ট্রি: ${Object.values(history).reduce((sum, h) => sum + h.length, 0)}`
    );
});

// ইউজার হিস্ট্রি
bot.command('history', adminOnly, async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const targetUserId = parts[1];

    if (!targetUserId) {
        await ctx.reply('❌ ইউজার আইডি দিন:\n`/history 123456789`');
        return;
    }

    const history = getHistory();
    const userHistory = history[targetUserId] || [];

    if (userHistory.length === 0) {
        await ctx.reply(`📭 ইউজার ${targetUserId} এর কোনো হিস্ট্রি নেই।`);
        return;
    }

    const user = getUser(targetUserId);
    let reply = `📜 **ইউজার হিস্ট্রি**\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `🆔 ${targetUserId}\n`;
    if (user) {
        reply += `👤 নাম: ${user.name || 'N/A'}\n`;
        reply += `🔢 মোট সার্চ: ${user.total_searches || 0}\n`;
    }
    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    const recent = userHistory.slice(-10).reverse();
    for (const entry of recent) {
        reply += `🎯 রোল: ${entry.roll}\n`;
        reply += `📅 ${new Date(entry.timestamp).toLocaleString()}\n`;
        reply += `${entry.result === 'found' ? '✅ পাওয়া গেছে' : '❌ পাওয়া যায়নি'}\n\n`;
    }

    reply += `📊 মোট: ${userHistory.length}টি সার্চ`;
    await ctx.replyWithMarkdown(reply);
});

// হিস্ট্রি ক্লিয়ার
bot.command('clear_history', adminOnly, async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const targetUserId = parts[1];

    if (!targetUserId) {
        await ctx.reply('❌ ইউজার আইডি দিন:\n`/clear_history 123456789`');
        return;
    }

    const history = getHistory();
    if (history[targetUserId]) {
        delete history[targetUserId];
        saveHistory(history);
        await ctx.reply(`✅ ইউজার ${targetUserId} এর হিস্ট্রি ক্লিয়ার করা হয়েছে।`);
    } else {
        await ctx.reply(`❌ ইউজার ${targetUserId} এর কোনো হিস্ট্রি নেই।`);
    }
});

// ইউজার ডিলিট
bot.command('delete_user', adminOnly, async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const targetUserId = parts[1];

    if (!targetUserId) {
        await ctx.reply('❌ ইউজার আইডি দিন:\n`/delete_user 123456789`');
        return;
    }

    const users = getUsers();
    if (users[targetUserId]) {
        delete users[targetUserId];
        saveUsers(users);
        
        const history = getHistory();
        if (history[targetUserId]) {
            delete history[targetUserId];
            saveHistory(history);
        }
        
        await ctx.reply(`✅ ইউজার ${targetUserId} ডিলিট করা হয়েছে।`);
    } else {
        await ctx.reply(`❌ ইউজার ${targetUserId} পাওয়া যায়নি।`);
    }
});

// ========================================
// ৬.সি সার্চ হ্যান্ডলার (রেজাল্ট সহ)
// ========================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const roll = ctx.message.text.trim();

    if (roll.startsWith('/')) return;

    // রোল ভ্যালিডেশন - ৬ বা ৭ ডিজিট
    if (!/^\d{6,7}$/.test(roll)) {
        await ctx.replyWithMarkdown(
            `❌ **ভুল রোল নম্বর!**\n\n` +
            `রোল নম্বর ৬ বা ৭ ডিজিটের হয়।\n` +
            `যেমন: \`240363\` অথবা \`2403631\``
        );
        return;
    }

    const waitingMsg = await ctx.replyWithMarkdown(
        `⏳ **অনুসন্ধান করা হচ্ছে...**\n🎯 রোল: \`${roll}\``
    );

    // প্রথমে স্টুডেন্ট তথ্য খুঁজি
    const studentResult = await session.searchStudent(roll);
    let studentInfo = null;
    let studentFound = false;

    // তারপর রেজাল্ট চেক করি
    const resultData = await session.getResult(roll);

    // স্টুডেন্ট তথ্য প্রসেসিং
    if (studentResult && studentResult.rows && studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
        studentFound = true;
    }

    // ইউজার আপডেট
    const user = getUser(userId) || { total_searches: 0 };
    user.total_searches = (user.total_searches || 0) + 1;
    user.joined = user.joined || new Date().toISOString();
    updateUser(userId, user);

    // রেজাল্ট আছে কিনা চেক
    const hasResult = resultData && resultData.success && resultData.data && resultData.data.length > 0;

    // হিস্ট্রি অ্যাড
    addHistory(userId, roll, studentFound || hasResult, studentInfo);

    // ওয়েটিং মেসেজ ডিলিট
    await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);

    // ১. স্টুডেন্ট তথ্য দেখান (যদি পাওয়া যায়)
    if (studentFound && studentInfo) {
        const studentReply = formatStudentData(studentInfo);
        const photoUrl = studentInfo.photoUrl;
        const photoFileId = studentInfo.photoFileId;
        
        const photoSent = await sendStudentPhoto(ctx, photoUrl, photoFileId, studentReply, roll, userId);
        
        if (!photoSent) {
            await ctx.replyWithMarkdown(`📝 **তথ্য পাওয়া গেছে (ফটো ছাড়া)**\n\n${studentReply}`);
        }
    }

    // ২. রেজাল্ট দেখান (যদি পাওয়া যায়)
    if (hasResult) {
        const resultReply = formatResultData(resultData, roll);
        if (resultReply) {
            await ctx.replyWithMarkdown(resultReply);
            
            // রেজাল্ট ফাইল লিংক (যদি থাকে)
            if (resultData.data[0].latestResults && resultData.data[0].latestResults.length > 0) {
                const latestResult = resultData.data[0].latestResults[0];
                if (latestResult.fileHash) {
                    const fileLink = `https://btebresultszone.com/api/result-file/${latestResult.fileHash}`;
                    await ctx.replyWithMarkdown(
                        `📄 **রেজাল্ট ফাইল ডাউনলোড:**\n` +
                        `[ফাইল ডাউনলোড করুন](${fileLink})`
                    );
                }
            }
        }
    }

    // ৩. কিছুই পাওয়া যায়নি
    if (!studentFound && !hasResult) {
        await ctx.replyWithMarkdown(
            `❌ **কোন তথ্য পাওয়া যায়নি!**\n\n` +
            `রোল: \`${roll}\`\n\n` +
            `🔍 নিম্নলিখিত কারণে হতে পারে:\n` +
            `• রোল নম্বরটি ভুল\n` +
            `• শিক্ষার্থী এখনও রেজিস্টার্ড নন\n` +
            `• সার্ভারে সমস্যা`
        );
    }
});

// ========================================
// ৭. এরর হ্যান্ডলার
// ========================================

bot.catch((err, ctx) => {
    console.error('❌ বট এরর:', err);
    ctx.reply('⚠️ সার্ভার এরর! কিছুক্ষণ পর আবার চেষ্টা করুন।');
});

// ========================================
// ৮. বট স্টার্ট এবং ওয়েব সার্ভার
// ========================================

console.log('🤖 বট চালু হচ্ছে...');
console.log('👑 অ্যাডমিন আইডি:', ADMIN_IDS);

// রেন্ডারের জন্য পোর্ট লিসেন
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 বট চলছে!');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// পোর্ট লিসেন শুরু করুন
const server = app.listen(port, () => {
    console.log(`✅ ওয়েব সার্ভার চলছে পোর্ট ${port} এ`);
});

// বট লঞ্চ করুন
bot.launch({
    dropPendingUpdates: true
})
.then(() => {
    console.log('✅ বট রেডি! টেলিগ্রামে /start দিন');
    console.log('📋 অ্যাডমিন প্যানেল: /admin');
    console.log(`👑 অ্যাডমিন ইউজার: ${ADMIN_IDS.join(', ')}`);
})
.catch((error) => {
    console.error('❌ বট লঞ্চ করতে সমস্যা:', error);
    process.exit(1);
});

// গ্রেসফুল শাটডাউন
process.once('SIGINT', () => {
    console.log('🛑 SIGINT পেয়েছি, বন্ধ করা হচ্ছে...');
    bot.stop('SIGINT');
    server.close(() => {
        console.log('✅ সার্ভার বন্ধ হয়েছে');
        process.exit(0);
    });
});

process.once('SIGTERM', () => {
    console.log('🛑 SIGTERM পেয়েছি, বন্ধ করা হচ্ছে...');
    bot.stop('SIGTERM');
    server.close(() => {
        console.log('✅ সার্ভার বন্ধ হয়েছে');
        process.exit(0);
    });
});

// আনকট এক্সেপশন হ্যান্ডলার
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// টেস্ট কমান্ড - আপনার আইডি দেখাবে
bot.command('myid', async (ctx) => {
    const userId = ctx.from.id;
    const isAdminUser = isAdmin(userId);
    await ctx.reply(
        `🆔 **আপনার আইডি:** \`${userId}\`\n\n` +
        `👑 **অ্যাডমিন?** ${isAdminUser ? '✅ হ্যাঁ' : '❌ না'}\n\n` +
        `📋 **অ্যাডমিন লিস্ট:** \`${ADMIN_IDS.join(', ')}\``
    );
});