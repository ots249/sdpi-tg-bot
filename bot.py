# bot.py
import os
import json
import httpx
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# ========== কনফিগারেশন ==========
TELEGRAM_TOKEN = "YOUR_BOT_TOKEN"  # BotFather থেকে নিবেন
LOGIN_URL = "https://dhakapolytechnic.com/api/auth/sign-in/email"
SEARCH_URL = "https://dhakapolytechnic.com/api/students"
EMAIL = "otsshamol@gmail.com"
PASSWORD = "oT$@2007"

# ========== সেশন ম্যানেজমেন্ট ==========
class SessionManager:
    def __init__(self):
        self.client = httpx.Client(timeout=30.0)
        self.cookies = None
        
    def login(self):
        try:
            response = self.client.post(
                LOGIN_URL,
                json={"email": EMAIL, "password": PASSWORD}
            )
            if response.status_code == 200:
                self.cookies = response.cookies
                print("✅ লগইন সফল!")
                return True
            print(f"❌ লগইন ব্যর্থ: {response.status_code}")
            return False
        except Exception as e:
            print(f"❌ লগইন এরর: {e}")
            return False
    
    def search_student(self, roll):
        # যদি কুকি না থাকে, লগইন করুন
        if not self.cookies:
            if not self.login():
                return None
        
        try:
            response = self.client.get(
                f"{SEARCH_URL}?search={roll}",
                cookies=self.cookies
            )
            
            # যদি কুকি এক্সপায়ার হয়ে যায় (401)
            if response.status_code == 401:
                print("🔄 কুকি এক্সপায়ার! রি-লগইন হচ্ছে...")
                if self.login():
                    response = self.client.get(
                        f"{SEARCH_URL}?search={roll}",
                        cookies=self.cookies
                    )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"❌ সার্চ ব্যর্থ: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"❌ সার্চ এরর: {e}")
            return None

# সেশন ইনিশিয়ালাইজ
session = SessionManager()

# ========== টেলিগ্রাম হ্যান্ডলার ==========
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🎓 **শিক্ষার্থী তথ্য অনুসন্ধান বট**\n"
        "━━━━━━━━━━━━━━━━━━━━\n\n"
        "আপনার বোর্ড রোল নম্বর পাঠান।\n"
        "যেমন: `240363`\n\n"
        "🔍 আমি আপনার সম্পূর্ণ তথ্য খুঁজে বের করব।\n"
        "📸 ফটো সহ পাবেন।\n\n"
        "⚡ দ্রুত তথ্য পেতে রোল নম্বর দিন।",
        parse_mode="Markdown"
    )

async def search(update: Update, context: ContextTypes.DEFAULT_TYPE):
    roll = update.message.text.strip()
    
    # ভ্যালিডেশন
    if not roll.isdigit():
        await update.message.reply_text(
            "❌ **ভুল ইনপুট!**\n"
            "দয়া করে সঠিক রোল নম্বর দিন (শুধু সংখ্যা)।\n"
            "যেমন: `240363`",
            parse_mode="Markdown"
        )
        return
    
    # ওয়েটিং মেসেজ
    waiting_msg = await update.message.reply_text(
        "⏳ **অনুসন্ধান করা হচ্ছে...**\n"
        "দয়া করে অপেক্ষা করুন।",
        parse_mode="Markdown"
    )
    
    # সার্চ করুন
    result = session.search_student(roll)
    
    # চেক করুন রেজাল্ট আছে কিনা
    if not result or not result.get('rows') or len(result['rows']) == 0:
        await waiting_msg.edit_text(
            "❌ **শিক্ষার্থী পাওয়া যায়নি!**\n\n"
            "দয়া করে চেক করুন:\n"
            "• রোল নম্বর সঠিক কিনা\n"
            "• রোল নম্বরটি বিদ্যমান কিনা\n\n"
            "আবার চেষ্টা করুন।",
            parse_mode="Markdown"
        )
        return
    
    # প্রথম শিক্ষার্থীর ডেটা নিন
    student = result['rows'][0]
    
    # ========== রিপ্লাই মেসেজ তৈরি ==========
    reply = f"🎓 **শিক্ষার্থীর তথ্য**\n"
    reply += f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
    
    # মৌলিক তথ্য
    reply += f"👤 **নাম (বাংলা):** {student.get('nameBn', 'N/A')}\n"
    reply += f"👤 **নাম (ইংরেজি):** {student.get('name', 'N/A')}\n"
    reply += f"🔢 **রোল:** {student.get('roll', 'N/A')}\n"
    reply += f"📋 **রেজিস্ট্রেশন:** {student.get('reg', 'N/A')}\n"
    reply += f"📚 **বিভাগ:** {student.get('dept', 'N/A')}\n"
    reply += f"🕐 **শিফট:** {student.get('shift', 'N/A')}\n"
    reply += f"📅 **সেশন:** {student.get('session', 'N/A')}\n\n"
    
    # পিতা-মাতা
    reply += f"👨‍👦 **পিতার নাম:** {student.get('fatherBn', 'N/A')}\n"
    reply += f"👩‍👦 **মাতার নাম:** {student.get('motherBn', 'N/A')}\n\n"
    
    # যোগাযোগ
    reply += f"🩸 **ব্লাড গ্রুপ:** {student.get('bloodGroup', 'N/A')}\n"
    reply += f"📱 **মোবাইল:** {student.get('mobile', 'N/A')}\n"
    reply += f"📞 **গার্ডিয়ান মোবাইল:** {student.get('guardianMobile', 'N/A')}\n\n"
    
    # ঠিকানা
    reply += f"🏠 **ঠিকানা:**\n"
    reply += f"গ্রাম: {student.get('village', 'N/A')}\n"
    reply += f"পোস্ট: {student.get('post', 'N/A')}\n"
    reply += f"উপজেলা: {student.get('upazila', 'N/A')}\n"
    reply += f"জেলা: {student.get('district', 'N/A')}\n"
    
    # স্ট্যাটাস
    reply += f"\n📌 **স্ট্যাটাস:** {student.get('status', 'N/A')}"
    
    # ========== ফটো সহ পাঠানো ==========
    photo_url = student.get('photoUrl')
    
    if photo_url:
        try:
            # ফটো সহ পাঠান
            await waiting_msg.delete()  # ওয়েটিং মেসেজ ডিলিট
            await update.message.reply_photo(
                photo=photo_url,
                caption=reply,
                parse_mode="Markdown"
            )
            print(f"✅ {roll} - ফটো সহ পাঠানো হয়েছে")
            
        except Exception as e:
            print(f"⚠️ ফটো লোড করতে সমস্যা: {e}")
            # ফটো না হলে শুধু টেক্সট
            await waiting_msg.edit_text(
                f"⚠️ ফটো লোড করতে সমস্যা হয়েছে।\n\n{reply}",
                parse_mode="Markdown"
            )
    else:
        # ফটো নেই, শুধু টেক্সট
        await waiting_msg.edit_text(reply, parse_mode="Markdown")
        print(f"✅ {roll} - টেক্সট পাঠানো হয়েছে")

# ========== কমান্ড হ্যান্ডলার ==========
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📖 **কীভাবে ব্যবহার করবেন:**\n\n"
        "1. `/start` - বট চালু করুন\n"
        "2. আপনার রোল নম্বর পাঠান (যেমন: `240363`)\n"
        "3. বট স্বয়ংক্রিয়ভাবে তথ্য খুঁজে দেবে\n\n"
        "🔍 রোল নম্বরটি ৬ ডিজিটের হয়।\n"
        "📸 তথ্যের সাথে ফটোও পাবেন।",
        parse_mode="Markdown"
    )

async def about(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🤖 **এই বট সম্পর্কে:**\n\n"
        "ঢাকা পলিটেকনিক ইনস্টিটিউটের\n"
        "শিক্ষার্থীদের তথ্য অনুসন্ধান বট।\n\n"
        "⚡ **বৈশিষ্ট্য:**\n"
        "• রোল দিয়ে শিক্ষার্থী খুঁজুন\n"
        "• ফটো সহ তথ্য দেখুন\n"
        "• দ্রুত ও নির্ভরযোগ্য\n\n"
        "📌 **ক্রেডিট:**\n"
        "ডেভেলপার: Oahid Towsif Shamol\n"
        "📅 সংস্করণ: 1.0",
        parse_mode="Markdown"
    )

# ========== মেইন ফাংশন ==========
def main():
    # বট ইনিশিয়ালাইজ
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    
    # হ্যান্ডলার যোগ করুন
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("about", about))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, search))
    
    # এরর হ্যান্ডলিং
    print("🤖 বট চালু হচ্ছে...")
    print("✅ বট রেডি! টেলিগ্রামে /start দিন")
    
    # বট চালান
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()