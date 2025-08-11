
"use client";

import React from 'react';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

export default function BetaTesterInfo() {
  return (
    <div className="space-y-6 text-sm p-2 prose prose-sm prose-headings:font-bold prose-headings:text-primary prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:text-foreground">
      
      <section>
        <h3>Welcome, VibeSync Beta Tester!</h3>
        <p>
          Thank you for helping us test and refine VibeSync. Your feedback is crucial for making this the best possible tool for travelers. This guide will walk you through the key areas to focus on during your testing.
        </p>
        <div className="mt-2 p-3 bg-muted rounded-md text-muted-foreground">
            <h4 className="font-semibold text-primary">សូមស្វាគមន៍ អ្នកសាកល្បង VibeSync Beta!</h4>
            <p>សូមអរគុណសម្រាប់ការជួយយើងខ្ញុំក្នុងការសាកល្បង និងកែលម្អ VibeSync។ មតិកែលម្អរបស់អ្នកគឺមានសារៈសំខាន់ណាស់ក្នុងការធ្វើឱ្យឧបករណ៍នេះក្លាយជាឧបករណ៍ដ៏ល្អបំផុតសម្រាប់អ្នកធ្វើដំណើរ។ ការណែនាំនេះនឹងបង្ហាញអ្នកពីចំណុចសំខាន់ៗដែលត្រូវផ្តោតអារម្មណ៍ក្នុងអំឡុងពេលសាកល្បងរបស់អ្នក។</p>
        </div>
      </section>

      <section>
        <h3>What is VibeSync?</h3>
        <p>
          VibeSync is an all-in-one app designed to help backpackers in Southeast Asia overcome language barriers. It combines language learning, live translation, and group communication tools to foster genuine connections.
        </p>
         <div className="mt-2 p-3 bg-muted rounded-md text-muted-foreground">
            <h4 className="font-semibold text-primary">តើ VibeSync ជាអ្វី?</h4>
            <p>VibeSync គឺជាកម្មវិធីរួមបញ្ចូលគ្នាដែលរចនាឡើងដើម្បីជួយអ្នកเดินทางស្ពាយកាបូបនៅអាស៊ីអាគ្នេយ៍ក្នុងការជំនះឧបសគ្គផ្នែកភាសា។ វាបូកបញ្ចូលការរៀនភាសា ការបកប្រែផ្ទាល់ និងឧបករណ៍ទំនាក់ទំនងជាក្រុម ដើម្បីបង្កើតទំនាក់ទំនងពិតប្រាកដ។</p>
        </div>
      </section>

      <section>
        <h3>Key Features to Test</h3>
        <p>Please spend time exploring the following core features, which can be found in the main sidebar navigation:</p>
        <ul>
          <li>
            <strong>Learn Tab:</strong> This is the home for language learning.
            <ul>
              <li><strong>Phrasebook:</strong> Does practicing phrases feel intuitive? Is the pronunciation feedback helpful?</li>
              <li><strong>Translator:</strong> Test the live text translation. Can you easily save new phrases to your personal practice list?</li>
            </ul>
          </li>
          <li>
            <strong>Converse Tab:</strong> This is the 1-on-1 live conversation tool.
            <ul>
              <li>Test speaking into the app with another person. Are the voice translations accurate and timely?</li>
            </ul>
          </li>
           <li>
            <strong>Connect Tab:</strong> This is the central hub for community interaction.
            <ul>
                <li><strong>Vibes:</strong> Join or create public/private chat rooms. Is the experience smooth?</li>
                <li><strong>Meetups:</strong> Find or create real-world events from within a Vibe.</li>
                <li><strong>Voice Rooms:</strong> Schedule and join multi-language group voice calls.</li>
            </ul>
          </li>
           <li>
            <strong>Buddy Alert System:</strong> A community safety feature.
            <ul>
                <li>Add another tester as a buddy from their profile.</li>
                <li>Try sending a Buddy Alert from the button in the sidebar. Did your buddy receive the notification?</li>
            </ul>
          </li>
        </ul>
        <div className="mt-2 p-3 bg-muted rounded-md text-muted-foreground">
            <h4 className="font-semibold text-primary">មុខងារសំខាន់ៗដែលត្រូវសាកល្បង</h4>
            <p>សូមចំណាយពេលស្វែងយល់ពីមុខងារសំខាន់ៗខាងក្រោម ដែលអាចរកបាននៅក្នុងแถบนำทางด้านข้างหลัก:</p>
             <ul>
              <li>
                <strong>แท็บเรียนรู้:</strong> នេះជាកន្លែងសម្រាប់រៀនភាសា។
                <ul>
                  <li><strong>สมุดวลี:</strong> តើការអនុវត្តឃ្លាមានលក្ខណៈងាយស្រួលដែរឬទេ? តើមតិកែលម្អអំពីការបញ្ចេញសំឡេងមានប្រយោជន៍ដែរឬទេ?</li>
                  <li><strong>นักแปล:</strong> សាកល្បងការបកប្រែអត្ថបទផ្ទាល់។ តើអ្នកអាចរក្សាទុកឃ្លាថ្មីៗទៅក្នុងបញ្ជីអនុវត្តផ្ទាល់ខ្លួនរបស់អ្នកបានយ៉ាងងាយស្រួលដែរឬទេ?</li>
                </ul>
              </li>
              <li>
                <strong>แท็บสนทนา:</strong> នេះជាឧបករណ៍សន្ទនាផ្ទាល់แบบตัวต่อตัว។
                <ul>
                  <li>សាកល្បងនិយាយចូលក្នុងកម្មវិធីជាមួយមនុស្សម្នាក់ទៀត។ តើការបកប្រែសំឡេងមានភាពត្រឹមត្រូវ និងទាន់ពេលដែរឬទេ?</li>
                </ul>
              </li>
               <li>
                <strong>แท็บเชื่อมต่อ:</strong> នេះជាศูนย์กลางสำหรับการโต้ตอบในชุมชน។
                <ul>
                    <li><strong>Vibes:</strong> ចូលរួម ឬបង្កើតห้องแชทสาธารณะ/ส่วนตัว។ តើประสบการณ์การใช้งานราบรื่นដែរឬទេ?</li>
                    <li><strong>การนัดพบ:</strong> ค้นหา หรือสร้างกิจกรรมในโลกแห่งความเป็นจริงจากภายใน Vibe។</li>
                    <li><strong>ห้องสนทนาเสียง:</strong> กำหนดเวลาและเข้าร่วมการโทรด้วยเสียงแบบกลุ่มหลายภาษา។</li>
                </ul>
              </li>
               <li>
                <strong>ระบบแจ้งเตือนเพื่อน:</strong> ฟีเจอร์ความปลอดภัยของชุมชน។
                <ul>
                    <li>เพิ่มผู้ทดสอบคนอื่นเป็นเพื่อนจากโปรไฟล์ของพวกเขา។</li>
                    <li>ลองส่งการแจ้งเตือนเพื่อนจากปุ่มในแถบด้านข้าง។ តើเพื่อนของคุณได้รับการแจ้งเตือนหรือไม่?</li>
                </ul>
              </li>
            </ul>
        </div>
      </section>

      <section>
        <h3>The Token Economy</h3>
        <p>
          The app uses a token system. For the beta, all token purchases are using a <strong>test environment</strong> (PayPal Sandbox). No real money will be charged.
        </p>
         <ul>
            <li><strong>Earning Tokens:</strong> You get a signup bonus and can earn more by mastering phrases in the "Learn" tab or by referring friends. Please test the referral system!</li>
            <li><strong>Spending Tokens:</strong> Use tokens for live translations, Converse/Voice Room usage, and downloading language packs.</li>
            <li><strong>Buying Tokens:</strong> Test the "Buy Tokens" functionality from your profile. You can use a test PayPal account to simulate a purchase.</li>
        </ul>
        <div className="mt-2 p-3 bg-muted rounded-md text-muted-foreground">
            <h4 className="font-semibold text-primary">เศรษฐกิจโทเค็น</h4>
            <p>แอปนี้ใช้ระบบโทเค็น สำหรับรุ่นเบต้า การซื้อโทเค็นทั้งหมดจะใช้<strong>สภาพแวดล้อมการทดสอบ</strong> (PayPal Sandbox) จะไม่มีการเรียกเก็บเงินจริง</p>
            <ul>
                <li><strong>การรับโทเค็น:</strong> คุณจะได้รับโบนัสการสมัครและสามารถรับเพิ่มได้โดยการฝึกฝนឃ្លาในแท็บ "เรียนรู้" หรือโดยการแนะนำเพื่อน โปรดทดสอบระบบการแนะนำ!</li>
                <li><strong>การใช้โทเค็น:</strong> ใช้โทเค็นสำหรับการแปลสด การใช้งานห้องสนทนา/ห้องเสียง และการดาวน์โหลดชุดภาษา</li>
                <li><strong>การซื้อโทเค็น:</strong> ทดสอบฟังก์ชัน "ซื้อโทเค็น" จากโปรไฟล์ของคุณ คุณสามารถใช้บัญชี PayPal ทดสอบเพื่อจำลองการซื้อ</li>
            </ul>
        </div>
      </section>

      <section>
        <h3>How to Give Feedback</h3>
        <p>
            Your feedback is the most valuable part of this beta test. Please use the <strong>"Give Feedback"</strong> link in the sidebar to submit your thoughts.
        </p>
        <p>What to report:</p>
        <ul>
            <li><strong>Bugs:</strong> Anything that seems broken or causes an error. Please describe the steps you took to make it happen. A screenshot is extremely helpful!</li>
            <li><strong>Translation Errors:</strong> If a translation seems wrong or unnatural, let us know.</li>
            <li><strong>Usability Issues:</strong> Is anything confusing or hard to use? Did you get stuck anywhere?</li>
            <li><strong>Feature Ideas:</strong> Is there anything you wish the app could do?</li>
        </ul>
        <div className="mt-2 p-3 bg-muted rounded-md text-muted-foreground">
            <h4 className="font-semibold text-primary">วิธีให้ข้อเสนอแนะ</h4>
            <p>ความคิดเห็นของคุณเป็นส่วนที่สำคัญที่สุดของการทดสอบเบต้านี้ โปรดใช้ลิงก์ <strong>"ให้ข้อเสนอแนะ"</strong> ในแถบด้านข้างเพื่อส่งความคิดเห็นของคุณ</p>
            <p>สิ่งที่ต้องรายงาน:</p>
            <ul>
                <li><strong>ข้อบกพร่อง:</strong> สิ่งใดก็ตามที่ดูเหมือนเสียหรือทำให้เกิดข้อผิดพลาด โปรดอธิบายขั้นตอนที่คุณทำเพื่อให้มันเกิดขึ้น ภาพหน้าจอมีประโยชน์อย่างยิ่ง!</li>
                <li><strong>ข้อผิดพลาดในการแปล:</strong> หากการแปลดูเหมือนผิดหรือผิดธรรมชาติ โปรดแจ้งให้เราทราบ</li>
                <li><strong>ปัญหาการใช้งาน:</strong> มีอะไรที่สับสนหรือใช้งานยากหรือไม่? คุณติดอยู่ที่ไหนหรือไม่?</li>
                <li><strong>แนวคิดเกี่ยวกับฟีเจอร์:</strong> มีอะไรที่คุณอยากให้แอปทำได้หรือไม่?</li>
            </ul>
        </div>
      </section>

       <section>
        <h3>Thank You!</h3>
        <p>
            We're a small team passionate about travel and connection. Your contribution will directly shape the future of VibeSync. Happy testing!
        </p>
         <div className="mt-2 p-3 bg-muted rounded-md text-muted-foreground">
            <h4 className="font-semibold text-primary">ขอบคุณ!</h4>
            <p>เราเป็นทีมเล็กๆ ที่หลงใหลในการเดินทางและการเชื่อมต่อ การมีส่วนร่วมของคุณจะกำหนดอนาคตของ VibeSync โดยตรง ขอให้มีความสุขกับการทดสอบ!</p>
        </div>
      </section>

    </div>
  );
}
