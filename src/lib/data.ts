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

export type Phrase = {
    id: string;
    english: string;
    translations: Partial<Record<LanguageCode, string>>;
    pronunciations: Partial<Record<LanguageCode, string>>;
}

export type Topic = {
    id: string;
    title: string;
    icon: LucideIcon;
    phrases: Phrase[];
};

export const phrasebook: Topic[] = [
    {
        id: 'greetings',
        title: 'Greetings',
        icon: Hand,
        phrases: [
            { id: 'g-1', english: 'Hello', translations: { thai: 'สวัสดี', vietnamese: 'Xin chào', khmer: 'ជំរាបសួរ', spanish: 'Hola', french: 'Bonjour' }, pronunciations: { thai: 'sa-wat-dii', vietnamese: 'sin chao', khmer: 'chum-reap-suor', spanish: 'oh-la', french: 'bon-zhoor' } },
            { id: 'g-2', english: 'Goodbye', translations: { thai: 'ลาก่อน', vietnamese: 'Tạm biệt', khmer: 'លាហើយ', spanish: 'Adiós', french: 'Au revoir' }, pronunciations: { thai: 'laa-gon', vietnamese: 'tam byet', khmer: 'lea-haeuy', spanish: 'ah-dyos', french: 'o ruh-vwar' } },
            { id: 'g-3', english: 'Thank you', translations: { thai: 'ขอบคุณ', vietnamese: 'Cảm ơn', khmer: 'អរគុណ', spanish: 'Gracias', french: 'Merci' }, pronunciations: { thai: 'khop-khun', vietnamese: 'gahm un', khmer: 'ar-kun', spanish: 'grah-syas', french: 'mehr-see' } },
            { id: 'g-4', english: 'Sorry / Excuse me', translations: { thai: 'ขอโทษ', vietnamese: 'Xin lỗi', khmer: 'សុំទោស', spanish: 'Lo siento / Perdón', french: 'Désolé / Excusez-moi' }, pronunciations: { thai: 'kho-thot', vietnamese: 'sin loy', khmer: 'som-tos', spanish: 'lo syen-to / per-don', french: 'day-zo-lay / ex-kyu-zay-mwa' } },
            { id: 'g-5', english: 'How are you?', translations: { thai: 'สบายดีไหม', vietnamese: 'Bạn khỏe không?', khmer: 'អ្នក​សុខសប្បាយ​ទេ?', spanish: '¿Cómo estás?', french: 'Comment ça va?' }, pronunciations: { thai: 'sa-bai-dii-mai', vietnamese: 'ban kwey khong?', khmer: 'neak sok-sa-bay te?', spanish: 'ko-mo es-tas?', french: 'ko-mon sa va?' } },
        ]
    },
    {
        id: 'directions',
        title: 'Directions',
        icon: Compass,
        phrases: [
            { id: 'd-1', english: 'Where is the toilet?', translations: { thai: 'ห้องน้ำอยู่ที่ไหน', vietnamese: 'Nhà vệ sinh ở đâu?', khmer: 'តើ​បង្គន់​នៅឯណា?', spanish: '¿Dónde está el baño?', french: 'Où sont les toilettes?' }, pronunciations: { thai: 'hong-nam-yuu-thii-nai', vietnamese: 'nya vey sin uh dau?', khmer: 'tae bangkon nov-ena?', spanish: 'don-day es-ta el ban-yo?', french: 'oo son lay twa-let?' } },
            { id: 'd-2', english: 'Left', translations: { thai: 'ซ้าย', vietnamese: 'Trái', khmer: 'ឆ្វេង', spanish: 'Izquierda', french: 'Gauche' }, pronunciations: { thai: 'saai', vietnamese: 'chai', khmer: 'chveng', spanish: 'is-kyer-da', french: 'gohsh' } },
            { id: 'd-3', english: 'Right', translations: { thai: 'ขวา', vietnamese: 'Phải', khmer: 'ស្ដាំ', spanish: 'Derecha', french: 'Droite' }, pronunciations: { thai: 'khwaa', vietnamese: 'fai', khmer: 'sdam', spanish: 'de-re-cha', french: 'drwat' } },
            { id: 'd-4', english: 'Straight', translations: { thai: 'ตรงไป', vietnamese: 'Thẳng', khmer: 'ត្រង់', spanish: 'Recto', french: 'Tout droit' }, pronunciations: { thai: 'trong-pai', vietnamese: 'thang', khmer: 'trong', spanish: 'rek-to', french: 'too drwa' } },
            { id: 'd-5', english: 'Stop', translations: { thai: 'หยุด', vietnamese: 'Dừng lại', khmer: 'ឈប់', spanish: 'Para', french: 'Arrêtez' }, pronunciations: { thai: 'yut', vietnamese: 'yung lai', khmer: 'chhop', spanish: 'pa-ra', french: 'a-re-tay' } },
        ]
    },
    {
        id: 'food',
        title: 'Ordering Food',
        icon: Utensils,
        phrases: [
            { id: 'f-1', english: 'The bill, please', translations: { thai: 'เก็บเงินด้วย', vietnamese: 'Làm ơn cho xin hóa đơn', khmer: 'សូម​វិក័យបត្រ', spanish: 'La cuenta, por favor', french: "L'addition, s'il vous plaît" }, pronunciations: { thai: 'gep-ngen-duay', vietnamese: 'lam un cho sin hwa dun', khmer: 'som vek-kai-ya-bat', spanish: 'la kwen-ta, por fa-vor', french: 'la-di-syon, seel voo pleh' } },
            { id: 'f-2', english: 'Delicious!', translations: { thai: 'อร่อย!', vietnamese: 'Ngon quá!', khmer: 'ឆ្ងាញ់!', spanish: '¡Delicioso!', french: 'Délicieux!' }, pronunciations: { thai: 'a-roi!', vietnamese: 'ngon kwa!', khmer: 'chnganh!', spanish: 'de-li-syo-so!', french: 'day-lee-syuh!' } },
            { id: 'f-3', english: 'Not spicy', translations: { thai: 'ไม่เผ็ด', vietnamese: 'Không cay', khmer: 'មិន​เผ็ด', spanish: 'No picante', french: 'Pas épicé' }, pronunciations: { thai: 'mai-phet', vietnamese: 'khong kai', khmer: 'min phet', spanish: 'no pi-kan-te', french: 'pa ay-pee-say' } },
            { id: 'f-4', english: 'Water', translations: { thai: 'น้ำ', vietnamese: 'Nước', khmer: 'ទឹក', spanish: 'Agua', french: 'Eau' }, pronunciations: { thai: 'naam', vietnamese: 'nu-uhk', khmer: 'teuk', spanish: 'a-gwa', french: 'o' } },
            { id: 'f-5', english: 'I am a vegetarian', translations: { thai: 'ฉันเป็นมังสวิรัติ', vietnamese: 'Tôi ăn chay', khmer: 'ខ្ញុំ​ជា​អ្នក​បួស', spanish: 'Soy vegetariano/a', french: 'Je suis végétarien(ne)' }, pronunciations: { thai: 'chan-pen-mang-sa-wi-rat', vietnamese: 'toy an chay', khmer: 'khnom chea anak buos', spanish: 'soy ve-he-ta-rya-no/a', french: 'zhuh swee vay-zhay-ta-ryan/ryen' } },
        ]
    },
    {
        id: 'numbers',
        title: 'Numbers',
        icon: Hash,
        phrases: [
            { id: 'n-1', english: 'One', translations: { thai: 'หนึ่ง', vietnamese: 'Một', khmer: 'មួយ', spanish: 'Uno', french: 'Un' }, pronunciations: { thai: 'neung', vietnamese: 'moht', khmer: 'muay', spanish: 'oo-no', french: 'an' } },
            { id: 'n-2', english: 'Two', translations: { thai: 'สอง', vietnamese: 'Hai', khmer: 'ពីរ', spanish: 'Dos', french: 'Deux' }, pronunciations: { thai: 'song', vietnamese: 'hai', khmer: 'pee', spanish: 'dohs', french: 'duh' } },
            { id: 'n-3', english: 'Three', translations: { thai: 'สาม', vietnamese: 'Ba', khmer: 'បី', spanish: 'Tres', french: 'Trois' }, pronunciations: { thai: 'saam', vietnamese: 'bah', khmer: 'bei', spanish: 'trehs', french: 'trwa' } },
            { id: 'n-4', english: 'Ten', translations: { thai: 'สิบ', vietnamese: 'Mười', khmer: 'ដប់', spanish: 'Diez', french: 'Dix' }, pronunciations: { thai: 'sip', vietnamese: 'moo-ee', khmer: 'dop', spanish: 'dyes', french: 'dees' } },
            { id: 'n-5', english: 'One hundred', translations: { thai: 'หนึ่งร้อย', vietnamese: 'Một trăm', khmer: 'មួយរយ', spanish: 'Cien', french: 'Cent' }, pronunciations: { thai: 'neung-roi', vietnamese: 'moht chram', khmer: 'muay roy', spanish: 'syen', french: 'son' } },
        ]
    },
    {
        id: 'questions',
        title: 'Basic Questions',
        icon: MessageCircleQuestion,
        phrases: [
            { id: 'q-1', english: 'What is your name?', translations: { thai: 'คุณชื่ออะไร', vietnamese: 'Tên bạn là gì?', khmer: 'តើ​អ្នក​មាន​ឈ្មោះ​អ្វី?', spanish: '¿Cómo te llamas?', french: 'Comment tu t’appelles?' }, pronunciations: { thai: 'khun-chue-a-rai', vietnamese: 'ten ban la zee?', khmer: 'tae neak mean chmuah ey?', spanish: 'ko-mo te ya-mas?', french: 'ko-mon tu ta-pel?' } },
            { id: 'q-2', english: 'How much is this?', translations: { thai: 'ราคาเท่าไหร่', vietnamese: 'Cái này giá bao nhiêu?', khmer: 'តើ​នេះ​តម្លៃ​ប៉ុន្មាន?', spanish: '¿Cuánto cuesta esto?', french: 'Combien ça coûte?' }, pronunciations: { thai: 'raa-khaa-thao-rai', vietnamese: 'kai nai ya bao nyu?', khmer: 'tae nih tamlay ponman?', spanish: 'kwan-to kwes-ta es-to?', french: 'kom-byan sa koot?' } },
            { id: 'q-3', english: 'Do you speak English?', translations: { thai: 'คุณพูดภาษาอังกฤษได้ไหม', vietnamese: 'Bạn có nói được tiếng Anh không?', khmer: 'តើ​អ្នក​និយាយ​ភាសា​អង់គ្លេស​ទេ?', spanish: '¿Hablas inglés?', french: 'Parlez-vous anglais?' }, pronunciations: { thai: 'khun-phuut-phaa-saa-ang-grit-dai-mai', vietnamese: 'ban ko noi du-uhk tyeng an khong?', khmer: 'tae neak ni-yeay phea-sa ang-kles te?', spanish: 'ab-las een-gles?', french: 'par-lay voo ong-gleh?' } },
            { id: 'q-4', english: 'Can you help me?', translations: { thai: 'คุณช่วยฉันได้ไหม', vietnamese: 'Bạn có thể giúp tôi không?', khmer: 'តើអ្នកអាចជួយខ្ញុំបានទេ?', spanish: '¿Puedes ayudarme?', french: 'Pouvez-vous m’aider?' }, pronunciations: { thai: 'khun-chuay-chan-dai-mai', vietnamese: 'ban ko tey yup toy khong?', khmer: 'tae neak ach chuoy khnom ban te?', spanish: 'pwe-des a-yoo-dar-me?', french: 'poo-vay voo may-day?' } },
            { id: 'q-5', english: 'Where are you from?', translations: { thai: 'คุณมาจากไหน', vietnamese: 'Bạn từ đâu đến?', khmer: 'តើ​អ្នក​មកពីណា?', spanish: '¿De dónde eres?', french: 'D’où venez-vous?' }, pronunciations: { thai: 'khun-maa-jaak-nai', vietnamese: 'ban tu dau den?', khmer: 'tae neak mok pi na?', spanish: 'de don-de e-res?', french: 'doo ve-nay voo?' } },
        ]
    }
];
