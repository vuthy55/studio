import type { LucideIcon } from "lucide-react";
import { Hand, Compass, Utensils, Hash, MessageCircleQuestion } from "lucide-react";

export const languages = [
    { value: 'khmer', label: 'Khmer' },
    { value: 'thai', label: 'Thai' },
    { value: 'vietnamese', label: 'Vietnamese' },
    { value: 'filipino', label: 'Filipino' },
    { value: 'malay', label: 'Malay' },
    { value: 'indonesian', label: 'Indonesian' },
    { value: 'burmese', label: 'Burmese' },
    { value: 'laos', label: 'Laos' },
    { value: 'tamil', label: 'Tamil' },
    { value: 'english', label: 'English' },
    { value: 'chinese', label: 'Chinese' },
    { value: 'french', label: 'French' },
    { value: 'spanish', label: 'Spanish' },
    { value: 'italian', label: 'Italian' },
] as const;

export type LanguageCode = typeof languages[number]['value'];

export type Phrase = {
    id: string;
    english: string;
    translations: Partial<Record<LanguageCode, string>>;
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
            { id: 'g-1', english: 'Hello', translations: { thai: 'สวัสดี', vietnamese: 'Xin chào', khmer: 'ជំរាបសួរ', spanish: 'Hola', french: 'Bonjour' } },
            { id: 'g-2', english: 'Goodbye', translations: { thai: 'ลาก่อน', vietnamese: 'Tạm biệt', khmer: 'លាហើយ', spanish: 'Adiós', french: 'Au revoir' } },
            { id: 'g-3', english: 'Thank you', translations: { thai: 'ขอบคุณ', vietnamese: 'Cảm ơn', khmer: 'អរគុណ', spanish: 'Gracias', french: 'Merci' } },
            { id: 'g-4', english: 'Sorry / Excuse me', translations: { thai: 'ขอโทษ', vietnamese: 'Xin lỗi', khmer: 'សុំទោស', spanish: 'Lo siento / Perdón', french: 'Désolé / Excusez-moi' } },
            { id: 'g-5', english: 'How are you?', translations: { thai: 'สบายดีไหม', vietnamese: 'Bạn khỏe không?', khmer: 'អ្នក​សុខសប្បាយ​ទេ?', spanish: '¿Cómo estás?', french: 'Comment ça va?' } },
        ]
    },
    {
        id: 'directions',
        title: 'Directions',
        icon: Compass,
        phrases: [
            { id: 'd-1', english: 'Where is the toilet?', translations: { thai: 'ห้องน้ำอยู่ที่ไหน', vietnamese: 'Nhà vệ sinh ở đâu?', khmer: 'តើ​បង្គន់​នៅឯណា?', spanish: '¿Dónde está el baño?', french: 'Où sont les toilettes?' } },
            { id: 'd-2', english: 'Left', translations: { thai: 'ซ้าย', vietnamese: 'Trái', khmer: 'ឆ្វេង', spanish: 'Izquierda', french: 'Gauche' } },
            { id: 'd-3', english: 'Right', translations: { thai: 'ขวา', vietnamese: 'Phải', khmer: 'ស្ដាំ', spanish: 'Derecha', french: 'Droite' } },
            { id: 'd-4', english: 'Straight', translations: { thai: 'ตรงไป', vietnamese: 'Thẳng', khmer: 'ត្រង់', spanish: 'Recto', french: 'Tout droit' } },
            { id: 'd-5', english: 'Stop', translations: { thai: 'หยุด', vietnamese: 'Dừng lại', khmer: 'ឈប់', spanish: 'Para', french: 'Arrêtez' } },
        ]
    },
    {
        id: 'food',
        title: 'Ordering Food',
        icon: Utensils,
        phrases: [
            { id: 'f-1', english: 'The bill, please', translations: { thai: 'เก็บเงินด้วย', vietnamese: 'Làm ơn cho xin hóa đơn', khmer: 'សូម​វិក័យបត្រ', spanish: 'La cuenta, por favor', french: "L'addition, s'il vous plaît" } },
            { id: 'f-2', english: 'Delicious!', translations: { thai: 'อร่อย!', vietnamese: 'Ngon quá!', khmer: 'ឆ្ងាញ់!', spanish: '¡Delicioso!', french: 'Délicieux!' } },
            { id: 'f-3', english: 'Not spicy', translations: { thai: 'ไม่เผ็ด', vietnamese: 'Không cay', khmer: 'មិន​เผ็ด', spanish: 'No picante', french: 'Pas épicé' } },
            { id: 'f-4', english: 'Water', translations: { thai: 'น้ำ', vietnamese: 'Nước', khmer: 'ទឹក', spanish: 'Agua', french: 'Eau' } },
            { id: 'f-5', english: 'I am a vegetarian', translations: { thai: 'ฉันเป็นมังสวิรัติ', vietnamese: 'Tôi ăn chay', khmer: 'ខ្ញុំ​ជា​អ្នក​បួស', spanish: 'Soy vegetariano/a', french: 'Je suis végétarien(ne)' } },
        ]
    },
    {
        id: 'numbers',
        title: 'Numbers',
        icon: Hash,
        phrases: [
            { id: 'n-1', english: 'One', translations: { thai: 'หนึ่ง', vietnamese: 'Một', khmer: 'មួយ', spanish: 'Uno', french: 'Un' } },
            { id: 'n-2', english: 'Two', translations: { thai: 'สอง', vietnamese: 'Hai', khmer: 'ពីរ', spanish: 'Dos', french: 'Deux' } },
            { id: 'n-3', english: 'Three', translations: { thai: 'สาม', vietnamese: 'Ba', khmer: 'បី', spanish: 'Tres', french: 'Trois' } },
            { id: 'n-4', english: 'Ten', translations: { thai: 'สิบ', vietnamese: 'Mười', khmer: 'ដប់', spanish: 'Diez', french: 'Dix' } },
            { id: 'n-5', english: 'One hundred', translations: { thai: 'หนึ่งร้อย', vietnamese: 'Một trăm', khmer: 'មួយរយ', spanish: 'Cien', french: 'Cent' } },
        ]
    },
    {
        id: 'questions',
        title: 'Basic Questions',
        icon: MessageCircleQuestion,
        phrases: [
            { id: 'q-1', english: 'What is your name?', translations: { thai: 'คุณชื่ออะไร', vietnamese: 'Tên bạn là gì?', khmer: 'តើ​អ្នក​មាន​ឈ្មោះ​អ្វី?', spanish: '¿Cómo te llamas?', french: 'Comment tu t’appelles?' } },
            { id: 'q-2', english: 'How much is this?', translations: { thai: 'ราคาเท่าไหร่', vietnamese: 'Cái này giá bao nhiêu?', khmer: 'តើ​នេះ​តម្លៃ​ប៉ុន្មាន?', spanish: '¿Cuánto cuesta esto?', french: 'Combien ça coûte?' } },
            { id: 'q-3', english: 'Do you speak English?', translations: { thai: 'คุณพูดภาษาอังกฤษได้ไหม', vietnamese: 'Bạn có nói được tiếng Anh không?', khmer: 'តើ​អ្នក​និយាយ​ភាសា​អង់គ្លេស​ទេ?', spanish: '¿Hablas inglés?', french: 'Parlez-vous anglais?' } },
            { id: 'q-4', english: 'Can you help me?', translations: { thai: 'คุณช่วยฉันได้ไหม', vietnamese: 'Bạn có thể giúp tôi không?', khmer: 'តើអ្នកអាចជួយខ្ញុំបានទេ?', spanish: '¿Puedes ayudarme?', french: 'Pouvez-vous m’aider?' } },
            { id: 'q-5', english: 'Where are you from?', translations: { thai: 'คุณมาจากไหน', vietnamese: 'Bạn từ đâu đến?', khmer: 'តើ​អ្នក​មកពីណា?', spanish: '¿De dónde eres?', french: 'D’où venez-vous?' } },
        ]
    }
];
