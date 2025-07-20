
import type { LucideIcon } from "lucide-react";
import { Hand, Compass, Utensils, Hash, MessageCircleQuestion } from "lucide-react";

export const languages = [
    { value: 'burmese', label: 'Burmese' },
    { value: 'chinese', label: 'Chinese' },
    { value: 'english', label: 'English' },
    { value: 'filipino', label: 'Filipino' },
    { value: 'french', label: 'French' },
    { value: 'indonesian', label: 'Indonesian' },
    { value: 'italian', label: 'Italian' },
    { value: 'khmer', label: 'Khmer' },
    { value: 'laos', label: 'Laos' },
    { value: 'malay', label: 'Malay' },
    { value: 'spanish', label: 'Spanish' },
    { value: 'tamil', label: 'Tamil' },
    { value: 'thai', label: 'Thai' },
    { value: 'vietnamese', label: 'Vietnamese' },
] as const;

export type LanguageCode = typeof languages[number]['value'];

type TranslatableText = {
    english: string;
    translations: Partial<Record<LanguageCode, string>>;
    pronunciations: Partial<Record<LanguageCode, string>>;
}

export type Phrase = TranslatableText & {
    id: string;
    answer?: TranslatableText;
}

export type Topic = {
    id: string;
    title: string;
    icon: LucideIcon;
    phrases: Phrase[];
};

export type PracticeHistory = {
    phraseText: string;
    lang: LanguageCode;
    passCount: number;
    failCount: number;
    lastAttempt?: string; // ISO string date
    lastAccuracy?: number;
};

export const phrasebook: Topic[] = [
    {
        id: 'questions',
        title: 'Basic Questions/Answers',
        icon: MessageCircleQuestion,
        phrases: [
            { 
                id: 'q-1', 
                english: 'What is your name?', 
                translations: { thai: 'คุณชื่ออะไร', vietnamese: 'Tên bạn là gì?', khmer: 'តើ​អ្នក​មាន​ឈ្មោះ​អ្វី?', spanish: '¿Cómo te llamas?', french: 'Comment tu t’appelles?', burmese: 'နာမည်ဘယ်လိုခေါ်လဲ', chinese: '你叫什么名字？', filipino: 'Ano ang pangalan mo?', indonesian: 'Siapa nama Anda?', italian: 'Come ti chiami?', laos: 'ເຈົ້າຊື່ຫຍັງ?', malay: 'Siapa nama awak?', tamil: 'உங்கள் பெயர் என்ன?' }, 
                pronunciations: { thai: 'khun-chue-a-rai', vietnamese: 'ten ban la zee?', khmer: 'tae neak mean chmuah ey?', spanish: 'ko-mo te ya-mas?', french: 'ko-mon tu ta-pel?' },
                answer: {
                    english: 'My name is...',
                    translations: { thai: 'ฉันชื่อ...', vietnamese: 'Tên tôi là...', khmer: 'ខ្ញុំ​ឈ្មោះ...', spanish: 'Me llamo...', french: 'Je m’appelle...', burmese: 'ကျွန်တော့်နာမည်က...', chinese: '我叫...', filipino: 'Ang pangalan ko ay...', indonesian: 'Nama saya...', italian: 'Mi chiamo...', laos: 'ຂ້ອຍຊື່...', malay: 'Nama saya...', tamil: 'என் பெயர்...' },
                    pronunciations: { thai: 'chan chue...', vietnamese: 'ten toy la...', khmer: 'khnom chmuah...', spanish: 'me ya-mo...', french: 'zhuh ma-pel...' }
                }
            },
            { 
                id: 'q-2', 
                english: 'How much is this?', 
                translations: { thai: 'ราคาเท่าไหร่', vietnamese: 'Cái này giá bao nhiêu?', khmer: 'តើ​នេះ​តម្លៃ​ប៉ុន្មាន?', spanish: '¿Cuánto cuesta esto?', french: 'Combien ça coûte?', burmese: 'ဒါဘယ်လောက်လဲ?', chinese: '这个多少钱？', filipino: 'Magkano ito?', indonesian: 'Berapa harganya ini?', italian: 'Quanto costa questo?', laos: 'ອັນນີ້ລາຄາເທົ່າໃດ?', malay: 'Berapakah harga ini?', tamil: 'இதன் விலை என்ன?' }, 
                pronunciations: { thai: 'raa-khaa-thao-rai', vietnamese: 'kai nai ya bao nyu?', khmer: 'tae nih tamlay ponman?', spanish: 'kwan-to kwes-ta es-to?', french: 'kom-byan sa koot?' },
                answer: {
                    english: 'It costs...',
                    translations: { thai: 'ราคา...', vietnamese: 'Nó giá...', khmer: 'វា​មាន​តម្លៃ...', spanish: 'Cuesta...', french: 'Ça coûte...', burmese: 'ဈေးနှုန်းကတော့...', chinese: '价钱是...', filipino: 'Ito ay nagkakahalaga ng...', indonesian: 'Harganya...', italian: 'Costa...', laos: 'ລາຄາ...', malay: 'Harganya...', tamil: 'இதன் விலை...' },
                    pronunciations: { thai: 'raa-khaa...', vietnamese: 'no ya...', khmer: 'vea mean tamlay...', spanish: 'kwes-ta...', french: 'sa koot...' }
                }
            },
            { 
                id: 'q-3', 
                english: 'Do you speak English?', 
                translations: { thai: 'คุณพูดภาษาอังกฤษได้ไหม', vietnamese: 'Bạn có nói được tiếng Anh không?', khmer: 'តើ​អ្នក​និយាយ​ភាសា​អង់គ្លេស​ទេ?', spanish: '¿Hablas inglés?', french: 'Parlez-vous anglais?', burmese: 'အင်္ဂလိပ်စကားပြောတတ်သလား?', chinese: '你会说英语吗？', filipino: 'Nagsasalita ka ba ng Ingles?', indonesian: 'Apakah Anda berbicara bahasa Inggris?', italian: 'Parli inglese?', laos: 'ເຈົ້າເວົ້າພາສາອັງກິດໄດ້ບໍ?', malay: 'Adakah anda bercakap Bahasa Inggeris?', tamil: 'நீங்கள் ஆங்கிலம் பேசுவீர்களா?' }, 
                pronunciations: { thai: 'khun-phuut-phaa-saa-ang-grit-dai-mai', vietnamese: 'ban ko noi du-uhk tyeng an khong?', khmer: 'tae neak ni-yeay phea-sa ang-kles te?', spanish: 'ab-las een-gles?', french: 'par-lay voo ong-gleh?' },
                answer: {
                    english: 'Yes, a little.',
                    translations: { thai: 'ใช่ นิดหน่อย', vietnamese: 'Vâng, một chút', khmer: 'បាទ បន្តិចបន្តួច', spanish: 'Sí, un poco.', french: 'Oui, un peu.', burmese: 'ဟုတ်ကဲ့၊ နည်းနည်းပါ', chinese: '是的，会一点', filipino: 'Oo, kaunti lang.', indonesian: 'Ya, sedikit.', italian: 'Sì, un po\'.', laos: 'ເຈົ້າ, ໜ້ອຍໜຶ່ງ', malay: 'Ya, sedikit.', tamil: 'ஆம், கொஞ்சம்' },
                    pronunciations: { thai: 'chai, nit-noi', vietnamese: 'vung, moht choot', khmer: 'baat, bon-tich-bon-tuoch', spanish: 'see, oon po-ko', french: 'wee, an puh' }
                }
            },
            { 
                id: 'q-4', 
                english: 'Can you help me?', 
                translations: { thai: 'คุณช่วยฉันได้ไหม', vietnamese: 'Bạn có thể giúp tôi không?', khmer: 'តើអ្នកអាចជួយខ្ញុំបានទេ?', spanish: '¿Puedes ayudarme?', french: 'Pouvez-vous m’aider?', burmese: 'ကျွန်တော့်ကိုကူညီနိုင်မလား?', chinese: '你能帮我一下吗？', filipino: 'Matutulungan mo ba ako?', indonesian: 'Bisakah Anda membantu saya?', italian: 'Puoi aiutarmi?', laos: 'ເຈົ້າຊ່ວຍຂ້ອຍໄດ້ບໍ?', malay: 'Bolehkah anda membantu saya?', tamil: 'நீங்கள் எனக்கு உதவ முடியுமா?' }, 
                pronunciations: { thai: 'khun-chuay-chan-dai-mai', vietnamese: 'ban ko tey yup toy khong?', khmer: 'tae neak ach chuoy khnom ban te?', spanish: 'pwe-des a-yoo-dar-me?', french: 'poo-vay voo may-day?' },
                answer: {
                    english: 'Of course.',
                    translations: { thai: 'แน่นอน', vietnamese: 'Dĩ nhiên', khmer: 'ពិតប្រាកដ​ណាស់', spanish: 'Por supuesto.', french: 'Bien sûr.', burmese: 'ဟုတ်ကဲ့၊ ရပါတယ်', chinese: '当然可以', filipino: 'Oo naman.', indonesian: 'Tentu saja.', italian: 'Certo.', laos: 'ແນ່ນອນ', malay: 'Sudah tentu.', tamil: 'நிச்சயமாக' },
                    pronunciations: { thai: 'nâe-non', vietnamese: 'yee nyen', khmer: 'pit-bra-ko-nas', spanish: 'por soo-pwes-to', french: 'byan soor' }
                }
            },
            { 
                id: 'q-5', 
                english: 'Where are you from?', 
                translations: { thai: 'คุณมาจากไหน', vietnamese: 'Bạn từ đâu đến?', khmer: 'តើ​អ្នក​មកពីណា?', spanish: '¿De dónde eres?', french: 'D’où venez-vous?', burmese: 'ဘယ်ကလာတာလဲ?', chinese: '你来自哪里？', filipino: 'Taga-saan ka?', indonesian: 'Anda berasal dari mana?', italian: 'Di dove sei?', laos: 'ເຈົ້າມາຈາກໃສ?', malay: 'Awak dari mana?', tamil: 'நீங்கள் எங்கிருந்து வருகிறீர்கள்?' }, 
                pronunciations: { thai: 'khun-maa-jaak-nai', vietnamese: 'ban tu dau den?', khmer: 'tae neak mok pi na?', spanish: 'de don-de e-res?', french: 'doo ve-nay voo?' },
                answer: {
                    english: 'I am from...',
                    translations: { thai: 'ฉันมาจาก...', vietnamese: 'Tôi đến từ...', khmer: 'ខ្ញុំ​មកពី...', spanish: 'Soy de...', french: 'Je viens de...', burmese: 'ကျွန်တော်...ကလာပါတယ်', chinese: '我来自...', filipino: 'Taga-...ako', indonesian: 'Saya dari...', italian: 'Vengo da...', laos: 'ຂ້ອຍມາຈາກ...', malay: 'Saya dari...', tamil: 'நான் ... இருந்து வருகிறேன்' },
                    pronunciations: { thai: 'chan maa jàak...', vietnamese: 'toy den tu...', khmer: 'khnom mok pi...', spanish: 'soy de...', french: 'zhuh vyan duh...' }
                }
            },
            { 
                id: 'q-6', 
                english: 'What time is it?', 
                translations: { thai: 'กี่โมงแล้ว', vietnamese: 'Mấy giờ rồi?', khmer: 'ម៉ោង​ប៉ុន្មាន​ហើយ?', spanish: '¿Qué hora es?', french: 'Quelle heure est-il?', burmese: 'ဘယ်အချိန်ရှိပြီလဲ?', chinese: '现在几点？', filipino: 'Anong oras na?', indonesian: 'Jam berapa sekarang?', italian: 'Che ore sono?', laos: 'ຈັກໂມງແລ້ວ?', malay: 'Pukul berapa sekarang?', tamil: 'மணி என்ன?' }, 
                pronunciations: { thai: 'gèe mohng láew', vietnamese: 'may yuh roy?', khmer: 'maong ponman haey?', spanish: 'ke o-ra es?', french: 'kel uhr e-til?' },
                answer: {
                    english: 'It is...',
                    translations: { thai: '...', vietnamese: 'Bây giờ là...', khmer: 'គឺ​ម៉ោង...', spanish: 'Son las...', french: 'Il est...', burmese: '...', chinese: '现在是...', filipino: '...', indonesian: 'Sekarang jam...', italian: 'Sono le...', laos: '...', malay: 'Sekarang pukul...', tamil: 'மணி...' },
                    pronunciations: { thai: '...', vietnamese: 'bay gio la...', khmer: 'keu maong...', spanish: 'son las...', french: 'il ay...' }
                }
            },
            { 
                id: 'q-7', 
                english: 'Can you repeat that?', 
                translations: { thai: 'พูดอีกทีได้ไหม', vietnamese: 'Bạn có thể nhắc lại được không?', khmer: 'និយាយម្តងទៀតបានទេ?', spanish: '¿Puede repetir, por favor?', french: 'Pouvez-vous répéter, s\'il vous plaît?', burmese: 'နောက်တစ်ခေါက်ပြောပေးလို့ရမလား?', chinese: '你能再说一遍吗？', filipino: 'Maaari mo bang ulitin iyon?', indonesian: 'Bisa tolong diulangi?', italian: 'Può ripetere, per favore?', laos: 'ກະລຸນາເວົ້າອີກເທື່ອຫນຶ່ງໄດ້ບໍ່?', malay: 'Boleh anda ulangi?', tamil: 'அதை மீண்டும் சொல்ல முடியுமா?' }, 
                pronunciations: { thai: 'pôot èek tee dâi măi', vietnamese: 'ban co the nhac lai duoc khong?', khmer: 'niyeay mdong tiet ban te?', spanish: 'pwe-de re-pe-teer, por fa-vor?', french: 'poo-vay voo ray-pay-tay, seel voo pleh?' },
                 answer: {
                    english: 'Yes, of course.',
                    translations: { thai: 'ได้ครับ/ค่ะ', vietnamese: 'Vâng, dĩ nhiên.', khmer: 'បាទ ពិតប្រាកដ​ណាស់', spanish: 'Sí, por supuesto.', french: 'Oui, bien sûr.', burmese: 'ဟုတ်ကဲ့၊ ရပါတယ်', chinese: '是的，当然', filipino: 'Oo, siyempre.', indonesian: 'Ya, tentu saja.', italian: 'Sì, certo.', laos: 'ເຈົ້າ, ແນ່ນອນ', malay: 'Ya, sudah tentu.', tamil: 'ஆம், நிச்சயமாக' },
                    pronunciations: { thai: 'dâi kráp/kâ', vietnamese: 'vung, yee nyen', khmer: 'baat, pit-bra-ko-nas', spanish: 'see, por soo-pwes-to', french: 'wee, byan soor' }
                }
            },
            { 
                id: 'q-8', 
                english: 'I don\'t understand', 
                translations: { thai: 'ฉันไม่เข้าใจ', vietnamese: 'Tôi không hiểu', khmer: 'ខ្ញុំ​មិន​យល់​ទេ', spanish: 'No entiendo', french: 'Je ne comprends pas', burmese: 'ကျွန်တော်နားမလည်ဘူး', chinese: '我不明白', filipino: 'Hindi ko maintindihan', indonesian: 'Saya tidak mengerti', italian: 'Non capisco', laos: 'ຂ້ອຍບໍ່ເຂົ້າໃຈ', malay: 'Saya tidak faham', tamil: 'எனக்கு புரியவில்லை' }, 
                pronunciations: { thai: 'chăn mâi kâo jai', vietnamese: 'toy khong hie-u', khmer: 'khnom min yol te', spanish: 'no en-tyen-do', french: 'zhuh nuh kom-pron pa' },
                answer: {
                    english: 'Let me explain again.',
                    translations: { thai: 'ให้ฉันอธิบายอีกครั้ง', vietnamese: 'Để tôi giải thích lại.', khmer: 'ឱ្យ​ខ្ញុំ​ពន្យល់​ម្តង​ទៀត', spanish: 'Déjame explicarte de nuevo.', french: 'Laissez-moi vous expliquer à nouveau.', burmese: 'ကျွန်တော်ပြန်ရှင်းပြပါ့မယ်', chinese: '让我再解释一遍', filipino: 'Hayaan mong ipaliwanag ko ulit.', indonesian: 'Biar saya jelaskan lagi.', italian: 'Lascia che ti spieghi di nuovo.', laos: 'ໃຫ້ຂ້ອຍອະທິບາຍອີກເທື່ອຫນຶ່ງ', malay: 'Biar saya terangkan sekali lagi.', tamil: 'நான் மீண்டும் விளக்குகிறேன்' },
                    pronunciations: { thai: 'hâi chăn à-tí-baai èek kráng', vietnamese: 'de toy yai thich lai', khmer: 'aoy khnom ponyol mdong tiet', spanish: 'de-ha-me eks-pli-kar-te de nwe-vo', french: 'lay-say mwa vooz eks-plee-kay a noo-vo' }
                }
            },
            { 
                id: 'q-9', 
                english: 'Where can I find...?', 
                translations: { thai: 'ฉันจะหา...ได้ที่ไหน', vietnamese: 'Tôi có thể tìm... ở đâu?', khmer: 'តើខ្ញុំអាចរក...នៅឯណា?', spanish: '¿Dónde puedo encontrar...?', french: 'Où puis-je trouver...?', burmese: '...ကိုဘယ်မှာရှာရမလဲ?', chinese: '我在哪里可以找到...？', filipino: 'Saan ko mahahanap ang...?', indonesian: 'Di mana saya bisa menemukan...?', italian: 'Dove posso trovare...?', laos: 'ຂ້ອຍຈະຊອກຫາ...ໄດ້ຢູ່ໃສ?', malay: 'Di mana saya boleh mencari...?', tamil: 'நான் எங்கே... காணலாம்?' }, 
                pronunciations: { thai: 'chăn jà hăa...dâi têe năi', vietnamese: 'toy co the tim... o dau?', khmer: 'tae khnom ach rok... nov-ena?', spanish: 'don-de pwe-do en-kon-trar...?', french: 'oo pweezh troo-vay...?' },
                answer: {
                    english: 'It is over there.',
                    translations: { thai: 'มันอยู่ทางนั้น', vietnamese: 'Nó ở đằng kia.', khmer: 'វា​នៅ​ទីនោះ', spanish: 'Está por allá.', french: 'C\'est par là.', burmese: 'အဲဒီမှာရှိတယ်', chinese: '就在那边', filipino: 'Doon po iyon.', indonesian: 'Itu di sebelah sana.', italian: 'È laggiù.', laos: 'ມັນຢູ່ທາງນັ້ນ', malay: 'Ia ada di sana.', tamil: 'அது அங்கே இருக்கிறது' },
                    pronunciations: { thai: 'man yòo taang nán', vietnamese: 'no uh dang kia', khmer: 'vea nov ti-nuh', spanish: 'es-ta por a-ya', french: 'say par la' }
                }
            },
            { 
                id: 'q-10', 
                english: 'What is this?', 
                translations: { thai: 'นี่คืออะไร', vietnamese: 'Cái này là gì?', khmer: 'តើនេះជាអ្វី?', spanish: '¿Qué es esto?', french: 'Qu\'est-ce que c\'est?', burmese: 'ဒါဘာလဲ?', chinese: '这是什么？', filipino: 'Ano ito?', indonesian: 'Apa ini?', italian: 'Che cos\'è questo?', laos: 'ອັນນີ້ແມ່ນຫຍັງ?', malay: 'Apa ini?', tamil: 'இது என்ன?' }, 
                pronunciations: { thai: 'nêe keu à-rai', vietnamese: 'kai nai la yi?', khmer: 'tae nih chea avei?', spanish: 'ke es es-to?', french: 'kes-kuh-say?' },
                 answer: {
                    english: 'This is a...',
                    translations: { thai: 'นี่คือ...', vietnamese: 'Đây là...', khmer: 'នេះ​គឺជា...', spanish: 'Esto es un/una...', french: 'C\'est un/une...', burmese: 'ဒါက...', chinese: '这是一个...', filipino: 'Ito ay isang...', indonesian: 'Ini adalah...', italian: 'Questo è un/una...', laos: 'ນີ້ແມ່ນ...', malay: 'Ini ialah...', tamil: 'இது ஒரு...' },
                    pronunciations: { thai: 'nêe keu...', vietnamese: 'day la...', khmer: 'nih keu-chea...', spanish: 'es-to es oon/oo-na...', french: 'sayt an/ewn...' }
                }
            },
        ]
    },
    {
        id: 'directions',
        title: 'Directions',
        icon: Compass,
        phrases: [
            { id: 'd-1', english: 'Where is the toilet?', translations: { thai: 'ห้องน้ำอยู่ที่ไหน', vietnamese: 'Nhà vệ sinh ở đâu?', khmer: 'តើ​បង្គន់​នៅឯណា?', spanish: '¿Dónde está el baño?', french: 'Où sont les toilettes?', burmese: 'အိမ်သာဘယ်မှာလဲ?', chinese: '厕所在哪里？', filipino: 'Nasaan ang banyo?', indonesian: 'Di mana toilet?', italian: 'Dov\'è il bagno?', laos: 'ຫ້ອງນ້ຳຢູ່ໃສ?', malay: 'Di manakah tandas?', tamil: 'கழிப்பறை எங்கே உள்ளது?' }, pronunciations: { thai: 'hong-nam-yuu-thii-nai', vietnamese: 'nya vey sin uh dau?', khmer: 'tae bangkon nov-ena?', spanish: 'don-day es-ta el ban-yo?', french: 'oo son lay twa-let?' } },
            { id: 'd-2', english: 'Left', translations: { thai: 'ซ้าย', vietnamese: 'Trái', khmer: 'ឆ្វេង', spanish: 'Izquierda', french: 'Gauche', burmese: 'ဘယ်ဘက်', chinese: '左', filipino: 'Kaliwa', indonesian: 'Kiri', italian: 'Sinistra', laos: 'ຊ້າຍ', malay: 'Kiri', tamil: 'இடது' }, pronunciations: { thai: 'saai', vietnamese: 'chai', khmer: 'chveng', spanish: 'is-kyer-da', french: 'gohsh' } },
            { id: 'd-3', english: 'Right', translations: { thai: 'ขวา', vietnamese: 'Phải', khmer: 'ស្ដាំ', spanish: 'Derecha', french: 'Droite', burmese: 'ညာဘက်', chinese: '右', filipino: 'Kanan', indonesian: 'Kanan', italian: 'Destra', laos: 'ຂວາ', malay: 'Kanan', tamil: 'வலது' }, pronunciations: { thai: 'khwaa', vietnamese: 'fai', khmer: 'sdam', spanish: 'de-re-cha', french: 'drwat' } },
            { id: 'd-4', english: 'Straight', translations: { thai: 'ตรงไป', vietnamese: 'Thẳng', khmer: 'ត្រង់', spanish: 'Recto', french: 'Tout droit', burmese: 'တည့်တည့်', chinese: '直行', filipino: 'Diretso', indonesian: 'Lurus', italian: 'Dritto', laos: 'ຊື່', malay: 'Terus', tamil: 'நேராக' }, pronunciations: { thai: 'trong-pai', vietnamese: 'thang', khmer: 'trong', spanish: 'rek-to', french: 'too drwa' } },
            { id: 'd-5', english: 'Stop', translations: { thai: 'หยุด', vietnamese: 'Dừng lại', khmer: 'ឈប់', spanish: 'Para', french: 'Arrêtez', burmese: 'ရပ်', chinese: '停止', filipino: 'Hinto', indonesian: 'Berhenti', italian: 'Stop', laos: 'ຢຸດ', malay: 'Berhenti', tamil: 'நிறுத்து' }, pronunciations: { thai: 'yut', vietnamese: 'yung lai', khmer: 'chhop', spanish: 'pa-ra', french: 'a-re-tay' } },
            { id: 'd-6', english: 'Here / There', translations: { thai: 'ที่นี่ / ที่นั่น', vietnamese: 'Ở đây / Ở đó', khmer: 'នៅទីនេះ / នៅទីនោះ', spanish: 'Aquí / Allí', french: 'Ici / Là', burmese: 'ဒီမှာ / ဟိုမှာ', chinese: '这里 / 那里', filipino: 'Dito / Doon', indonesian: 'Di sini / Di sana', italian: 'Qui / Lì', laos: 'ຢູ່ທີ່ນີ້ / ຢູ່ທີ່ນັ້ນ', malay: 'Di sini / Di sana', tamil: 'இங்கே / அங்கே' }, pronunciations: { thai: 'thii-nii / thii-nan', vietnamese: 'o day / o do', khmer: 'nov ti-nih / nov ti-nuh', spanish: 'a-kee / a-yee', french: 'ee-see / la' } },
            { id: 'd-7', english: 'I\'m lost', translations: { thai: 'ฉันหลงทาง', vietnamese: 'Tôi bị lạc', khmer: 'ខ្ញុំ​វង្វេង', spanish: 'Estoy perdido/a', french: 'Je suis perdu(e)', burmese: 'ကျွန်တော်လမ်းပျောက်နေတယ်', chinese: '我迷路了', filipino: 'Naliligaw ako', indonesian: 'Saya tersesat', italian: 'Mi sono perso/a', laos: 'ຂ້ອຍ​ຫຼົງ​ທາງ', malay: 'Saya sesat', tamil: 'நான் தொலைந்துவிட்டேன்' }, pronunciations: { thai: 'chan long thang', vietnamese: 'toy bi lak', khmer: 'khnom vngveng', spanish: 'es-toy per-dee-do/a', french: 'zhuh swee per-due' } },
            { id: 'd-8', english: 'Is it far?', translations: { thai: 'มันไกลไหม', vietnamese: 'Nó có xa không?', khmer: 'តើវាឆ្ងាយទេ?', spanish: '¿Está lejos?', french: 'C\'est loin?', burmese: 'အဝေးကြီးလား?', chinese: '远吗？', filipino: 'Malayo ba?', indonesian: 'Apakah itu jauh?', italian: 'È lontano?', laos: 'ມັນໄກບໍ?', malay: 'Jauhkah?', tamil: 'அது தொலைவில் உள்ளதா?' }, pronunciations: { thai: 'man glai mai', vietnamese: 'no co sa khong', khmer: 'tae vea chngay te?', spanish: 'es-ta le-hos?', french: 'seh lwan?' } },
            { id: 'd-9', english: 'How do I get to...?', translations: { thai: 'ฉันจะไป...ได้อย่างไร', vietnamese: 'Làm thế nào để đến...?', khmer: 'តើខ្ញុំទៅ...ដោយរបៀបណា?', spanish: '¿Cómo llego a...?', french: 'Comment je vais à...?', burmese: '...ကိုဘယ်လိုသွားရမလဲ?', chinese: '我怎么去...？', filipino: 'Paano ako makakapunta sa...?', indonesian: 'Bagaimana cara saya ke...?', italian: 'Come arrivo a...?', laos: 'ຂ້ອຍຈະໄປ...ໄດ້ແນວໃດ?', malay: 'Bagaimana saya boleh sampai ke...?', tamil: 'நான் எப்படி ... செல்வது?' }, pronunciations: { thai: 'chan ja bpai ... dai yang rai', vietnamese: 'lam the nao de den...?', khmer: 'tae khnhom tow... daoy robeab na?', spanish: 'ko-mo ye-go a...?', french: 'ko-mon zhuh vay a...?' } },
            { id: 'd-10', english: 'Airport', translations: { thai: 'สนามบิน', vietnamese: 'Sân bay', khmer: 'ព្រលានយន្តហោះ', spanish: 'Aeropuerto', french: 'Aéroport', burmese: 'လေဆိပ်', chinese: '飞机场', filipino: 'Paliparan', indonesian: 'Bandara', italian: 'Aeroporto', laos: 'ສະຫນາມບິນ', malay: 'Lapangan terbang', tamil: 'விமான நிலையம்' }, pronunciations: { thai: 'sa-naam-bin', vietnamese: 'sun bay', khmer: 'pro-lean-yon-hos', spanish: 'a-e-ro-pwer-to', french: 'a-ay-ro-por' } },
        ]
    },
    {
        id: 'greetings',
        title: 'Greetings',
        icon: Hand,
        phrases: [
            { id: 'g-1', english: 'Hello', translations: { thai: 'สวัสดี', vietnamese: 'Xin chào', khmer: 'ជំរាបសួរ', spanish: 'Hola', french: 'Bonjour', burmese: 'မင်္ဂလာပါ', chinese: '你好', filipino: 'Hello', indonesian: 'Halo', italian: 'Ciao', laos: 'ສະບາຍດີ', malay: 'Helo', tamil: 'வணக்கம்' }, pronunciations: { thai: 'sa-wat-dii', vietnamese: 'sin chao', khmer: 'chum-reap-suor', spanish: 'oh-la', french: 'bon-zhoor' } },
            { id: 'g-2', english: 'Goodbye', translations: { thai: 'ลาก่อน', vietnamese: 'Tạm biệt', khmer: 'លាហើយ', spanish: 'Adiós', french: 'Au revoir', burmese: ' टाटा', chinese: '再见', filipino: 'Paalam', indonesian: 'Selamat tinggal', italian: 'Arrivederci', laos: 'ລາກ່ອນ', malay: 'Selamat tinggal', tamil: 'போய் வருகிறேன்' }, pronunciations: { thai: 'laa-gon', vietnamese: 'tam byet', khmer: 'lea-haeuy', spanish: 'ah-dyos', french: 'o ruh-vwar' } },
            { id: 'g-3', english: 'Thank you', translations: { thai: 'ขอบคุณ', vietnamese: 'Cảm ơn', khmer: 'អរគុណ', spanish: 'Gracias', french: 'Merci', burmese: 'ကျေးဇူးတင်ပါတယ်', chinese: '谢谢', filipino: 'Salamat', indonesian: 'Terima kasih', italian: 'Grazie', laos: 'ຂອບໃຈ', malay: 'Terima kasih', tamil: 'நன்றி' }, pronunciations: { thai: 'khop-khun', vietnamese: 'gahm un', khmer: 'ar-kun', spanish: 'grah-syas', french: 'mehr-see' } },
            { id: 'g-4', english: 'Sorry / Excuse me', translations: { thai: 'ขอโทษ', vietnamese: 'Xin lỗi', khmer: 'សុំទោស', spanish: 'Lo siento / Perdón', french: 'Désolé / Excusez-moi', burmese: 'တောင်းပန်ပါတယ် / တစ်ဆိတ်လောက်ပါ', chinese: '对不起 / 打扰一下', filipino: 'Paumanhin / Makikiraan po', indonesian: 'Maaf / Permisi', italian: 'Mi dispiace / Scusi', laos: 'ຂໍໂທດ', malay: 'Maaf / Tumpang lalu', tamil: 'மன்னிக்கவும் / தயவுசெய்து' }, pronunciations: { thai: 'kho-thot', vietnamese: 'sin loy', khmer: 'som-tos', spanish: 'lo syen-to / per-don', french: 'day-zo-lay / ex-kyu-zay-mwa' } },
            { id: 'g-5', english: 'How are you?', translations: { thai: 'สบายดีไหม', vietnamese: 'Bạn khỏe không?', khmer: 'អ្នក​សុខសប្បាយ​ទេ?', spanish: '¿Cómo estás?', french: 'Comment ça va?', burmese: 'နေကောင်းလား?', chinese: '你好吗？', filipino: 'Kumusta ka?', indonesian: 'Apa kabar?', italian: 'Come stai?', laos: 'ສະບາຍດີບໍ?', malay: 'Apa khabar?', tamil: 'நீங்கள் எப்படி இருக்கிறீர்கள்?' }, pronunciations: { thai: 'sa-bai-dii-mai', vietnamese: 'ban kwey khong?', khmer: 'neak sok-sa-bay te?', spanish: 'ko-mo es-tas?', french: 'ko-mon sa va?' } },
            { id: 'g-6', english: 'You\'re welcome', translations: { thai: 'ด้วยความยินดี', vietnamese: 'Không có gì', khmer: 'មិនអីទេ', spanish: 'De nada', french: 'De rien', burmese: 'ရပါတယ်', chinese: '不客气', filipino: 'Walang anuman', indonesian: 'Sama-sama', italian: 'Prego', laos: 'ບໍ່ເປັນຫຍັງ', malay: 'Sama-sama', tamil: 'பரவாயில்லை' }, pronunciations: { thai: 'duay-khwam-yin-dii', vietnamese: 'khong co gi', khmer: 'min-ey-te', spanish: 'de na-da', french: 'duh ree-an' } },
            { id: 'g-7', english: 'Nice to meet you', translations: { thai: 'ยินดีที่ได้รู้จัก', vietnamese: 'Rất vui được gặp bạn', khmer: 'រីករាយដែលបានជួបអ្នក', spanish: 'Mucho gusto', french: 'Enchanté(e)', burmese: 'တွေ့ရတာဝမ်းသာပါတယ်', chinese: '很高兴认识你', filipino: 'Ikinagagalak kong makilala ka', indonesian: 'Senang bertemu denganmu', italian: 'Piacere di conoscerti', laos: 'ຍິນດີທີ່ໄດ້ຮູ້ຈັກ', malay: 'Selamat berkenalan', tamil: 'உங்களை சந்தித்ததில் மகிழ்ச்சி' }, pronunciations: { thai: 'yin-dii-thii-dai-ruu-jak', vietnamese: 'rat vui duoc gap ban', khmer: 'rik-reay del ban chuob neak', spanish: 'moo-cho goos-to', french: 'on-shon-tay' } },
            { id: 'g-8', english: 'Good morning', translations: { thai: 'อรุณสวัสดิ์', vietnamese: 'Chào buổi sáng', khmer: 'អរុណ​សួស្តី', spanish: 'Buenos días', french: 'Bonjour', burmese: 'မင်္ဂလာနံနက်ခင်းပါ', chinese: '早上好', filipino: 'Magandang umaga', indonesian: 'Selamat pagi', italian: 'Buongiorno', laos: 'ສະບາຍດີຕອນເຊົ້າ', malay: 'Selamat pagi', tamil: 'காலை வணக்கம்' }, pronunciations: { thai: 'a-run-sa-wat', vietnamese: 'chao buoi sang', khmer: 'a-run-suo-sdey', spanish: 'bwe-nos dee-as', french: 'bon-zhoor' } },
            { id: 'g-9', english: 'Good evening', translations: { thai: 'สวัสดีตอนเย็น', vietnamese: 'Chào buổi tối', khmer: 'សាយណ្ហសួស្ដី', spanish: 'Buenas noches', french: 'Bonsoir', burmese: 'မင်္ဂလာညနေခင်းပါ', chinese: '晚上好', filipino: 'Magandang gabi', indonesian: 'Selamat malam', italian: 'Buonasera', laos: 'ສະບາຍດີຕອນແລງ', malay: 'Selamat petang', tamil: 'மாலை வணக்கம்' }, pronunciations: { thai: 'sa-wat-dii-ton-yen', vietnamese: 'chao buoi toi', khmer: 'sa-yan-suos-dey', spanish: 'bwe-nas no-ches', french: 'bon-swar' } },
            { id: 'g-10', english: 'Yes / No', translations: { thai: 'ใช่ / ไม่ใช่', vietnamese: 'Vâng / Không', khmer: 'បាទ / ទេ', spanish: 'Sí / No', french: 'Oui / Non', burmese: 'ဟုတ် / မဟုတ်ဘူး', chinese: '是 / 不是', filipino: 'Oo / Hindi', indonesian: 'Ya / Tidak', italian: 'Sì / No', laos: 'ເຈົ້າ / ບໍ່', malay: 'Ya / Tidak', tamil: 'ஆம் / இல்லை' }, pronunciations: { thai: 'chai / mai-chai', vietnamese: 'vung / khong', khmer: 'baat / te', spanish: 'see / no', french: 'wee / non' } },
        ]
    },
    {
        id: 'numbers',
        title: 'Numbers',
        icon: Hash,
        phrases: [
            { id: 'n-1', english: 'One', translations: { thai: 'หนึ่ง', vietnamese: 'Một', khmer: 'មួយ', spanish: 'Uno', french: 'Un', burmese: 'တစ်', chinese: '一', filipino: 'Isa', indonesian: 'Satu', italian: 'Uno', laos: 'ຫນຶ່ງ', malay: 'Satu', tamil: 'ஒன்று' }, pronunciations: { thai: 'neung', vietnamese: 'moht', khmer: 'muay', spanish: 'oo-no', french: 'an' } },
            { id: 'n-2', english: 'Two', translations: { thai: 'สอง', vietnamese: 'Hai', khmer: 'ពីរ', spanish: 'Dos', french: 'Deux', burmese: 'နှစ်', chinese: '二', filipino: 'Dalawa', indonesian: 'Dua', italian: 'Due', laos: 'ສອງ', malay: 'Dua', tamil: 'இரண்டு' }, pronunciations: { thai: 'song', vietnamese: 'hai', khmer: 'pee', spanish: 'dohs', french: 'duh' } },
            { id: 'n-3', english: 'Three', translations: { thai: 'สาม', vietnamese: 'Ba', khmer: 'បី', spanish: 'Tres', french: 'Trois', burmese: 'သုံး', chinese: '三', filipino: 'Tatlo', indonesian: 'Tiga', italian: 'Tre', laos: 'ສາມ', malay: 'Tiga', tamil: 'மூன்று' }, pronunciations: { thai: 'saam', vietnamese: 'bah', khmer: 'bei', spanish: 'trehs', french: 'trwa' } },
            { id: 'n-4', english: 'Four', translations: { thai: 'สี่', vietnamese: 'Bốn', khmer: 'បួន', spanish: 'Cuatro', french: 'Quatre', burmese: 'လေး', chinese: '四', filipino: 'Apat', indonesian: 'Empat', italian: 'Quattro', laos: 'ສີ່', malay: 'Empat', tamil: 'நான்கு' }, pronunciations: { thai: 'sii', vietnamese: 'bohn', khmer: 'buan', spanish: 'kwa-tro', french: 'katr' } },
            { id: 'n-5', english: 'Five', translations: { thai: 'ห้า', vietnamese: 'Năm', khmer: 'ប្រាំ', spanish: 'Cinco', french: 'Cinq', burmese: 'ငါး', chinese: '五', filipino: 'Lima', indonesian: 'Lima', italian: 'Cinque', laos: 'ຫ້າ', malay: 'Lima', tamil: 'ஐந்து' }, pronunciations: { thai: 'haa', vietnamese: 'nam', khmer: 'pram', spanish: 'seen-ko', french: 'sank' } },
            { id: 'n-6', english: 'Six', translations: { thai: 'หก', vietnamese: 'Sáu', khmer: 'ប្រាំមួយ', spanish: 'Seis', french: 'Six', burmese: 'ခြောက်', chinese: '六', filipino: 'Anim', indonesian: 'Enam', italian: 'Sei', laos: 'ຫົກ', malay: 'Enam', tamil: 'ஆறு' }, pronunciations: { thai: 'hok', vietnamese: 'sau', khmer: 'pram-muay', spanish: 'says', french: 'sees' } },
            { id: 'n-7', english: 'Seven', translations: { thai: 'เจ็ด', vietnamese: 'Bảy', khmer: 'ប្រាំពីរ', spanish: 'Siete', french: 'Sept', burmese: 'ခုနစ်', chinese: '七', filipino: 'Pito', indonesian: 'Tujuh', italian: 'Sette', laos: 'ເຈັດ', malay: 'Tujuh', tamil: 'ஏழு' }, pronunciations: { thai: 'jet', vietnamese: 'bai', khmer: 'pram-pee', spanish: 'sye-te', french: 'set' } },
            { id: 'n-8', english: 'Eight', translations: { thai: 'แปด', vietnamese: 'Tám', khmer: 'ប្រាំបី', spanish: 'Ocho', french: 'Huit', burmese: 'ရှစ်', chinese: '八', filipino: 'Walo', indonesian: 'Delapan', italian: 'Otto', laos: 'ແປດ', malay: 'Lapan', tamil: 'எட்டு' }, pronunciations: { thai: 'paet', vietnamese: 'tahm', khmer: 'pram-bei', spanish: 'o-cho', french: 'weet' } },
            { id: 'n-9', english: 'Nine', translations: { thai: 'เก้า', vietnamese: 'Chín', khmer: 'ប្រាំបួន', spanish: 'Nueve', french: 'Neuf', burmese: 'ကိုး', chinese: '九', filipino: 'Siyam', indonesian: 'Sembilan', italian: 'Nove', laos: 'ເກົ້າ', malay: 'Sembilan', tamil: 'ஒன்பது' }, pronunciations: { thai: 'gao', vietnamese: 'chin', khmer: 'pram-buan', spanish: 'nwe-ve', french: 'nuhf' } },
            { id: 'n-10', english: 'Ten', translations: { thai: 'สิบ', vietnamese: 'Mười', khmer: 'ដប់', spanish: 'Diez', french: 'Dix', burmese: 'ဆယ်', chinese: '十', filipino: 'Sampu', indonesian: 'Sepuluh', italian: 'Dieci', laos: 'ສິບ', malay: 'Sepuluh', tamil: 'பத்து' }, pronunciations: { thai: 'sip', vietnamese: 'moo-ee', khmer: 'dop', spanish: 'dyes', french: 'dees' } },
            { id: 'n-20', english: 'Twenty', translations: { thai: 'ยี่สิบ', vietnamese: 'Hai mươi', khmer: 'ម្ភៃ', spanish: 'Veinte', french: 'Vingt', burmese: 'နှစ်ဆယ်', chinese: '二十', filipino: 'Dalawampu', indonesian: 'Dua puluh', italian: 'Venti', laos: 'ຊາວ', malay: 'Dua puluh', tamil: 'இருபது' }, pronunciations: { thai: 'yii-sip', vietnamese: 'hai meu-oi', khmer: 'ma-phai', spanish: 'bayn-te', french: 'van' } },
            { id: 'n-30', english: 'Thirty', translations: { thai: 'สามสิบ', vietnamese: 'Ba mươi', khmer: 'សាមសិប', spanish: 'Treinta', french: 'Trente', burmese: 'သုံးဆယ်', chinese: '三十', filipino: 'Tatlumpu', indonesian: 'Tiga puluh', italian: 'Trenta', laos: 'ສາມສິບ', malay: 'Tiga puluh', tamil: 'முப்பது' }, pronunciations: { thai: 'saam-sip', vietnamese: 'bah meu-oi', khmer: 'saam-seb', spanish: 'trayn-ta', french: 'tront' } },
            { id: 'n-40', english: 'Forty', translations: { thai: 'สี่สิบ', vietnamese: 'Bốn mươi', khmer: 'សែសិប', spanish: 'Cuarenta', french: 'Quarante', burmese: 'လေးဆယ်', chinese: '四十', filipino: 'Apatnapu', indonesian: 'Empat puluh', italian: 'Quaranta', laos: 'ສີ່ສິບ', malay: 'Empat puluh', tamil: 'நாற்பது' }, pronunciations: { thai: 'sii-sip', vietnamese: 'bohn meu-oi', khmer: 'sai-seb', spanish: 'kwa-ren-ta', french: 'ka-ront' } },
            { id: 'n-50', english: 'Fifty', translations: { thai: 'ห้าสิบ', vietnamese: 'Năm mươi', khmer: 'ហាសិប', spanish: 'Cinquenta', french: 'Cinquante', burmese: 'ငါးဆယ်', chinese: '五十', filipino: 'Limampu', indonesian: 'Lima puluh', italian: 'Cinquanta', laos: 'ຫ້າສິບ', malay: 'Lima puluh', tamil: 'ஐம்பது' }, pronunciations: { thai: 'haa-sip', vietnamese: 'nam meu-oi', khmer: 'ha-seb', spanish: 'seen-kwen-ta', french: 'san-kont' } },
            { id: 'n-60', english: 'Sixty', translations: { thai: 'หกสิบ', vietnamese: 'Sáu mươi', khmer: 'ហុកសិប', spanish: 'Sesenta', french: 'Soixante', burmese: 'ခြောက်ဆယ်', chinese: '六十', filipino: 'Animnapu', indonesian: 'Enam puluh', italian: 'Sessanta', laos: 'ຫົກສິບ', malay: 'Enam puluh', tamil: 'அறுபது' }, pronunciations: { thai: 'hok-sip', vietnamese: 'sau meu-oi', khmer: 'hok-seb', spanish: 'se-sen-ta', french: 'swa-sont' } },
            { id: 'n-70', english: 'Seventy', translations: { thai: 'เจ็ดสิบ', vietnamese: 'Bảy mươi', khmer: 'ចិតសិប', spanish: 'Setenta', french: 'Soixante-dix', burmese: 'ခုနစ်ဆယ်', chinese: '七十', filipino: 'Pitumpu', indonesian: 'Tujuh puluh', italian: 'Settanta', laos: 'ເຈັດສິບ', malay: 'Tujuh puluh', tamil: 'எழுபது' }, pronunciations: { thai: 'jet-sip', vietnamese: 'bai meu-oi', khmer: 'chet-seb', spanish: 'se-ten-ta', french: 'swa-sont-dees' } },
            { id: 'n-80', english: 'Eighty', translations: { thai: 'แปดสิบ', vietnamese: 'Tám mươi', khmer: 'ប៉ែតសិប', spanish: 'Ochenta', french: 'Quatre-vingts', burmese: 'ရှစ်ဆယ်', chinese: '八十', filipino: 'Walumpu', indonesian: 'Delapan puluh', italian: 'Ottanta', laos: 'ແປດສິບ', malay: 'Lapan puluh', tamil: 'எண்பது' }, pronunciations: { thai: 'paet-sip', vietnamese: 'tahm meu-oi', khmer: 'paet-seb', spanish: 'o-chen-ta', french: 'ka-truh-van' } },
            { id: 'n-90', english: 'Ninety', translations: { thai: 'เก้าสิบ', vietnamese: 'Chín mươi', khmer: 'កៅសិប', spanish: 'Noventa', french: 'Quatre-vingt-dix', burmese: 'ကိုးဆယ်', chinese: '九十', filipino: 'Siyamnapu', indonesian: 'Sembilan puluh', italian: 'Novanta', laos: 'ເກົ້າສິບ', malay: 'Sembilan puluh', tamil: 'தொண்ணூறு' }, pronunciations: { thai: 'gao-sip', vietnamese: 'chin meu-oi', khmer: 'kao-seb', spanish: 'no-ven-ta', french: 'ka-truh-van-dees' } },
            { id: 'n-100', english: 'One hundred', translations: { thai: 'หนึ่งร้อย', vietnamese: 'Một trăm', khmer: 'មួយរយ', spanish: 'Cien', french: 'Cent', burmese: 'တစ်ရာ', chinese: '一百', filipino: 'Isang daan', indonesian: 'Seratus', italian: 'Cento', laos: 'ຫນຶ່ງຮ້ອຍ', malay: 'Seratus', tamil: 'நூறு' }, pronunciations: { thai: 'neung-roi', vietnamese: 'moht chram', khmer: 'muay roy', spanish: 'syen', french: 'son' } },
            { id: 'n-1000', english: 'One thousand', translations: { thai: 'หนึ่งพัน', vietnamese: 'Một nghìn', khmer: 'មួយ​ពាន់', spanish: 'Mil', french: 'Mille', burmese: 'တစ်ထောင်', chinese: '一千', filipino: 'Isang libo', indonesian: 'Seribu', italian: 'Mille', laos: 'ຫນຶ່ງພັນ', malay: 'Seribu', tamil: 'ஆயிரம்' }, pronunciations: { thai: 'neung-phan', vietnamese: 'moht ngin', khmer: 'muay poan', spanish: 'meel', french: 'meel' } },
            { id: 'n-10000', english: 'Ten thousand', translations: { thai: 'หนึ่งหมื่น', vietnamese: 'Mười nghìn', khmer: 'មួយ​ម៉ឺន', spanish: 'Diez mil', french: 'Dix mille', burmese: 'တစ်သောင်း', chinese: '一万', filipino: 'Sampung libo', indonesian: 'Sepuluh ribu', italian: 'Diecimila', laos: 'ສິບພັນ', malay: 'Sepuluh ribu', tamil: 'பத்தாயிரம்' }, pronunciations: { thai: 'neung-meun', vietnamese: 'moo-ee ngin', khmer: 'muay meun', spanish: 'dyes meel', french: 'dee meel' } },
            { id: 'n-1000000', english: 'One million', translations: { thai: 'หนึ่งล้าน', vietnamese: 'Một triệu', khmer: 'មួយ​លាន', spanish: 'Un millón', french: 'Un million', burmese: 'တစ်သန်း', chinese: '一百万', filipino: 'Isang milyon', indonesian: 'Satu juta', italian: 'Un milione', laos: 'ຫນຶ່ງລ້ານ', malay: 'Satu juta', tamil: 'ஒரு மில்லியன்' }, pronunciations: { thai: 'neung-laan', vietnamese: 'moht chri-eu', khmer: 'muay lean', spanish: 'oon mee-yon', french: 'an mee-lyon' } },
        ]
    },
    {
        id: 'food',
        title: 'Ordering Food',
        icon: Utensils,
        phrases: [
            { id: 'f-1', english: 'The bill, please', translations: { thai: 'เก็บเงินด้วย', vietnamese: 'Làm ơn cho xin hóa đơn', khmer: 'សូម​វិក័យបត្រ', spanish: 'La cuenta, por favor', french: "L'addition, s'il vous plaît", burmese: 'ဘေလ်ကျသင့်ငွေရှင်းပါ', chinese: '买单', filipino: 'Pakikuha ng bill', indonesian: 'Minta bonnya', italian: 'Il conto, per favore', laos: 'ເກັບເງິນແດ່', malay: 'Minta bil', tamil: 'பில், தயவுசெய்து' }, pronunciations: { thai: 'gep-ngen-duay', vietnamese: 'lam un cho sin hwa dun', khmer: 'som vek-kai-ya-bat', spanish: 'la kwen-ta, por fa-vor', french: 'la-di-syon, seel voo pleh' } },
            { id: 'f-2', english: 'Delicious!', translations: { thai: 'อร่อย!', vietnamese: 'Ngon quá!', khmer: 'ឆ្ងាញ់!', spanish: '¡Delicioso!', french: 'Délicieux!', burmese: 'အရမ်းအရသာရှိတယ်!', chinese: '好吃！', filipino: 'Masarap!', indonesian: 'Enak!', italian: 'Delizioso!', laos: 'ແຊບ!', malay: 'Sedap!', tamil: 'சுவையாக இருக்கிறது!' }, pronunciations: { thai: 'a-roi!', vietnamese: 'ngon kwa!', khmer: 'chnganh!', spanish: 'de-li-syo-so!', french: 'day-lee-syuh!' } },
            { id: 'f-3', english: 'Not spicy', translations: { thai: 'ไม่เผ็ด', vietnamese: 'Không cay', khmer: 'មិន​เผ็ด', spanish: 'No picante', french: 'Pas épicé', burmese: 'အစပ်မပါ', chinese: '不辣', filipino: 'Hindi maanghang', indonesian: 'Tidak pedas', italian: 'Non piccante', laos: 'ບໍ່เผ็ด', malay: 'Tidak pedas', tamil: 'காரம் இல்லை' }, pronunciations: { thai: 'mai-phet', vietnamese: 'khong kai', khmer: 'min phet', spanish: 'no pi-kan-te', french: 'pa ay-pee-say' } },
            { id: 'f-4', english: 'Water', translations: { thai: 'น้ำ', vietnamese: 'Nước', khmer: 'ទឹក', spanish: 'Agua', french: 'Eau', burmese: 'ရေ', chinese: '水', filipino: 'Tubig', indonesian: 'Air', italian: 'Acqua', laos: 'ນໍ້າ', malay: 'Air', tamil: 'தண்ணீர்' }, pronunciations: { thai: 'naam', vietnamese: 'nu-uhk', khmer: 'teuk', spanish: 'a-gwa', french: 'o' } },
            { id: 'f-5', english: 'I am a vegetarian', translations: { thai: 'ฉันเป็นมังสวิรัติ', vietnamese: 'Tôi ăn chay', khmer: 'ខ្ញុំ​ជា​អ្នក​បួស', spanish: 'Soy vegetariano/a', french: 'Je suis végétarien(ne)', burmese: 'ကျွန်တော်သက်သတ်လွတ်စားပါတယ်', chinese: '我是素食者', filipino: 'Gulay lang ang kinakain ko', indonesian: 'Saya seorang vegetarian', italian: 'Sono vegetariano/a', laos: 'ຂ້ອຍກິນເຈ', malay: 'Saya seorang vegetarian', tamil: 'நான் ஒரு சைவம்' }, pronunciations: { thai: 'chan-pen-mang-sa-wi-rat', vietnamese: 'toy an chay', khmer: 'khnom chea anak buos', spanish: 'soy ve-he-ta-rya-no/a', french: 'zhuh swee vay-zhay-ta-ryan/ryen' } },
            { id: 'f-6', english: 'A table for two, please', translations: { thai: 'โต๊ะสำหรับสองคนครับ/ค่ะ', vietnamese: 'Cho tôi một bàn cho hai người', khmer: 'តុសម្រាប់ពីរនាក់ សូម', spanish: 'Una mesa para dos, por favor', french: 'Une table pour deux, s\'il vous plaît', burmese: 'နှစ်ယောက်အတွက်โต๊ะတစ်လုံးပါ', chinese: '一张两人桌，谢谢', filipino: 'Isang mesa para sa dalawa, pakiusap', indonesian: 'Satu meja untuk dua orang, ya', italian: 'Un tavolo per due, per favore', laos: 'ໂຕະສຳລັບສອງຄົນ', malay: 'Satu meja untuk dua orang', tamil: 'இருவருக்கான மேசை, தயவுசெய்து' }, pronunciations: { thai: 'dto sahm-ràp sŏng kon kráp/kâ', vietnamese: 'cho toy mot ban cho hai nguoi', khmer: 'tok samrab pi neak, som', spanish: 'oo-na me-sa pa-ra dohs, por fa-vor', french: 'ewn tah-bluh poor duh, seel voo pleh' } },
            { id: 'f-7', english: 'Can I see the menu?', translations: { thai: 'ขอดูเมนูหน่อยครับ/ค่ะ', vietnamese: 'Cho tôi xem thực đơn được không?', khmer: 'ខ្ញុំអាចមើលเมនុយបានទេ?', spanish: '¿Puedo ver el menú?', french: 'Je peux voir le menu?', burmese: 'မီနူးကြည့်လို့ရမလား?', chinese: '我能看下菜单吗？', filipino: 'Maaari ko bang makita ang menu?', indonesian: 'Bolehkah saya melihat menunya?', italian: 'Posso vedere il menu?', laos: 'ຂ້ອຍເບິ່ງເມນູໄດ້ບໍ່?', malay: 'Boleh saya lihat menu?', tamil: 'நான் மெனுவைப் பார்க்கலாமா?' }, pronunciations: { thai: 'kŏr doo may-noo nòi kráp/kâ', vietnamese: 'cho toy sem teuk don duoc khong?', khmer: 'khnom ach meul menu ban te?', spanish: 'pwe-do ver el me-noo?', french: 'zhuh puh vwar luh muh-new?' } },
            { id: 'f-8', english: 'I would like...', translations: { thai: 'ฉันต้องการ...', vietnamese: 'Tôi muốn...', khmer: 'ខ្ញុំ​ចង់បាន...', spanish: 'Quisiera...', french: 'Je voudrais...', burmese: 'ကျွန်တော်...လိုချင်တယ်', chinese: '我想要...', filipino: 'Gusto ko ng...', indonesian: 'Saya mau...', italian: 'Vorrei...', laos: 'ຂ້ອຍຢາກໄດ້...', malay: 'Saya mahu...', tamil: 'நான் விரும்புகிறேன்...' }, pronunciations: { thai: 'chăn dtông gaan...', vietnamese: 'toy muon...', khmer: 'khnom jong ban...', spanish: 'kee-sye-ra...', french: 'zhuh voo-dray...' } },
            { id: 'f-9', english: 'Cheers!', translations: { thai: 'ชนแก้ว!', vietnamese: 'Chúc sức khoẻ!', khmer: 'ជល់មួយ!', spanish: '¡Salud!', french: 'Santé!', burmese: 'ချီးယားစ်!', chinese: '干杯！', filipino: 'Tagay!', indonesian: 'Tos!', italian: 'Salute!', laos: 'ຊົນ!', malay: 'Sorak!', tamil: 'சியர்ஸ்!' }, pronunciations: { thai: 'chon gâew!', vietnamese: 'chook seuk khwe!', khmer: 'chul muoy!', spanish: 'sa-lood!', french: 'son-tay!' } },
            { id: 'f-10', english: 'It was delicious!', translations: { thai: 'อร่อยมาก!', vietnamese: 'Rất ngon!', khmer: 'ឆ្ងាញ់ណាស់!', spanish: '¡Estuvo delicioso!', french: 'C\'était délicieux!', burmese: 'အရမ်းကောင်းတယ်!', chinese: '非常好吃！', filipino: 'Napakasarap!', indonesian: 'Sangat lezat!', italian: 'Era delizioso!', laos: 'ມັນແຊບຫຼາຍ!', malay: 'Sangat sedap!', tamil: 'அது சுவையாக இருந்தது!' }, pronunciations: { thai: 'à-ròi mâak!', vietnamese: 'rut ngon!', khmer: 'chnganh nas!', spanish: 'es-too-vo de-lee-syo-so!', french: 'say-tay day-lee-syuh!' } },
        ]
    }
];

    

    