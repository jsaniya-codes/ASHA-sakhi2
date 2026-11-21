import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { speakTextWithFallback, stopAllSpeech } from '../utils/i18n';
import type { AppLanguage } from '../types';

interface ExplainWithVideoProps {
  appLanguage: AppLanguage;
}

type VideoTopic =
  | 'All Topics'
  | 'Maternal Health'
  | 'Pregnancy Care'
  | 'Child Nutrition & Vaccination'
  | 'Hygiene & Sanitation'
  | 'Disease Prevention';

interface VideoChapter {
  durationSec: number;
  heading: Record<'en' | 'kn' | 'hi', string>;
  explanation: Record<'en' | 'kn' | 'hi', string>;
  visualCue: string;
}

interface HealthVideoLesson {
  id: string;
  topic: Exclude<VideoTopic, 'All Topics'>;
  title: Record<'en' | 'kn' | 'hi', string>;
  subtitle: string;
  coverImage: string;
  totalDurationSec: number;
  chapters: VideoChapter[];
}

const VIDEO_LESSONS: HealthVideoLesson[] = [
  {
    id: 'maternal-anc',
    topic: 'Maternal Health',
    title: {
      en: '4 Essential Antenatal Checkups & Danger Signs',
      kn: 'ಗರ್ಭಾವಸ್ಥೆಯಲ್ಲಿ 4 ಅಗತ್ಯ ತಪಾಸಣೆಗಳು ಮತ್ತು ಅಪಾಯದ ಲಕ್ಷಣಗಳು',
      hi: 'गर्भावस्था में 4 ज़रूरी जांच और खतरे के लक्षण',
    },
    subtitle: 'ANC schedule, blood pressure checks, IFA tablets & 108 referral',
    coverImage: '/src/assets/images/video_maternal_care_1795282331567.jpg',
    totalDurationSec: 36,
    chapters: [
      {
        durationSec: 12,
        visualCue: 'Register within first 12 weeks at PHC / Sub-Centre',
        heading: {
          en: '1. Early Pregnancy Registration & 4 ANC Visits',
          kn: '1. ಮೊದಲ 12 ವಾರಗಳಲ್ಲಿ ನೋಂದಣಿ ಮತ್ತು 4 ಎಎನ್‌ಸಿ ಭೇಟಿಗಳು',
          hi: '1. पहले 12 हफ्तों में पंजीकरण और 4 एएनसी जांच',
        },
        explanation: {
          en: 'Register pregnancy in the first 3 months and complete at least 4 antenatal checkups. Each checkup tracks blood pressure, weight gain, urine protein, and hemoglobin.',
          kn: 'ಮೊದಲ ಮೂರು ತಿಂಗಳಲ್ಲಿ ಗರ್ಭಧಾರಣೆ ನೋಂದಾಯಿಸಿ ಮತ್ತು ಕನಿಷ್ಠ 4 ಬಾರಿ ಆರೋಗ್ಯ ತಪಾಸಣೆ ಮಾಡಿಸಿ. ಪ್ರತಿ ಭೇಟಿಯಲ್ಲಿ ಬಿಪಿ, ತೂಕ ಮತ್ತು ಹಿಮೋಗ್ಲೋಬಿನ್ ಪರೀಕ್ಷಿಸಲಾಗುತ್ತದೆ.',
          hi: 'पहले 3 महीनों में गर्भावस्था पंजीकृत करें और कम से कम 4 बार जांच कराएं। हर जांच में बीपी, वजन और हीमोग्लोबिन देखा जाता है।',
        },
      },
      {
        durationSec: 12,
        visualCue: '180 days of daily Iron-Folic Acid & Calcium',
        heading: {
          en: '2. Daily Iron & Folic Acid (IFA) + Nutritious Diet',
          kn: '2. ಪ್ರತಿದಿನ ಐಎಫ್‌ಎ ಮಾತ್ರೆ ಮತ್ತು ಪೌಷ್ಟಿಕ ಆಹಾರ',
          hi: '2. रोज़ आयरन-फोलिक एसिड गोली और पौष्टिक भोजन',
        },
        explanation: {
          en: 'Take 1 red Iron-Folic Acid tablet daily after dinner with lemon water or amla for better absorption. Eat ragi, green leafy vegetables, dal, eggs, or sprouted pulses every day.',
          kn: 'ರಕ್ತಹೀನತೆ ತಡೆಯಲು ಪ್ರತಿದಿನ ರಾತ್ರಿ ಊಟದ ನಂತರ ಒಂದು ಐಎಫ್‌ಎ ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳಿ. ರಾಗಿ, ಸೊಪ್ಪು, ಬೇಳೆ ಮತ್ತು ಮೊಳಕೆ ಕಾಳುಗಳನ್ನು ನಿಯಮಿತವಾಗಿ ಸೇವಿಸಿ.',
          hi: 'खून की कमी से बचने के लिए रोज़ रात के खाने के बाद एक आयरन गोली लें। हरी सब्ज़ियाँ, दाल, रागी और अंकुरित अनाज खाएं।',
        },
      },
      {
        durationSec: 12,
        visualCue: 'Call 108 immediately for any danger sign',
        heading: {
          en: '3. Watch for Danger Signs — Call 108 Immediately',
          kn: '3. ಅಪಾಯದ ಲಕ್ಷಣ ಕಂಡರೆ ತಕ್ಷಣ 108 ಕರೆ ಮಾಡಿ',
          hi: '3. खतरे के लक्षण दिखने पर तुरंत 108 बुलाएं',
        },
        explanation: {
          en: 'Severe headache, blurred vision, swelling of face or hands, vaginal bleeding, or reduced baby movement are emergencies. Go to the nearest PHC or District Hospital immediately.',
          kn: 'ತೀವ್ರ ತಲೆನೋವು, ಮಸುಕು ದೃಷ್ಟಿ, ಮುಖ ಅಥವಾ ಕೈ ಊತ, ರಕ್ತಸ್ರಾವ ಅಥವಾ ಮಗುವಿನ ಚಲನೆ ಕಡಿಮೆಯಾದರೆ ತಕ್ಷಣ 108 ಆಂಬ್ಯುಲೆನ್ಸ್ ಕರೆ ಮಾಡಿ ಆಸ್ಪತ್ರೆಗೆ ತೆರಳಿ.',
          hi: 'तेज़ सिरदर्द, धुंधला दिखना, चेहरे या हाथ में सूजन, रक्तस्राव या बच्चे की हलचल कम होना आपातकाल है। तुरंत 108 बुलाकर अस्पताल जाएं।',
        },
      },
    ],
  },
  {
    id: 'pregnancy-birth-prep',
    topic: 'Pregnancy Care',
    title: {
      en: 'Safe Institutional Delivery & Birth Preparedness',
      kn: 'ಸುರಕ್ಷಿತ ಆಸ್ಪತ್ರೆ ಹೆರಿಗೆ ಮತ್ತು ಪೂರ್ವಸಿದ್ಧತೆ',
      hi: 'सुरक्षित संस्थागत प्रसव और जन्म की तैयारी',
    },
    subtitle: 'Hospital bag, blood donor plan, 108 transport & first-hour breastfeeding',
    coverImage: '/src/assets/images/video_maternal_care_1795282331567.jpg',
    totalDurationSec: 30,
    chapters: [
      {
        durationSec: 15,
        visualCue: 'Plan transport, MCP card & hospital kit by month 7',
        heading: {
          en: '1. Birth Plan & Emergency Transport Ready',
          kn: '1. ಹೆರಿಗೆ ಯೋಜನೆ ಮತ್ತು 108 ಸಾರಿಗೆ ಸಿದ್ಧತೆ',
          hi: '1. प्रसव योजना और 108 एम्बुलेंस की तैयारी',
        },
        explanation: {
          en: 'By the 7th month, identify your delivery PHC or FRU, keep your Mother and Child Protection (MCP) card ready, save the 108 number, and arrange a family companion.',
          kn: 'ಏಳನೇ ತಿಂಗಳೊಳಗೆ ಹೆರಿಗೆ ಆಸ್ಪತ್ರೆ ಗುರುತಿಸಿ, ತಾಯಿ-ಮಗು ಕಾರ್ಡ್ ಸಿದ್ಧವಾಗಿಡಿ ಮತ್ತು ತುರ್ತು 108 ಸಂಖ್ಯೆ ಹಾಗೂ ಕುಟುಂಬದ ಸಹಾಯಕರನ್ನು ಸಿದ್ಧಪಡಿಸಿ.',
          hi: 'सातवें महीने तक प्रसव अस्पताल तय करें, एमसीपी कार्ड तैयार रखें, और 108 एम्बुलेंस नंबर परिवार के पास रखें।',
        },
      },
      {
        durationSec: 15,
        visualCue: 'Initiate colostrum feeding within 1 hour of birth',
        heading: {
          en: '2. Golden First Hour & Skin-to-Skin Warmth',
          kn: '2. ಮೊದಲ ಗಂಟೆಯೊಳಗೆ ತಾಯಿ ಹಾಲು ಮತ್ತು ಬೆಚ್ಚಗಿನ ಆರೈಕೆ',
          hi: '2. जन्म के पहले घंटे में स्तनपान और गर्माहट',
        },
        explanation: {
          en: 'Place the newborn skin-to-skin on the mother’s chest immediately after birth and begin thick yellow first milk (colostrum) within 1 hour. Do not give honey, water, or ghutti.',
          kn: 'ಹುಟ್ಟಿದ ಒಂದು ಗಂಟೆಯೊಳಗೆ ಮಗುವಿಗೆ ತಾಯಿಯ ಮೊದಲ ಗಿಣ್ಣು ಹಾಲು (ಕೊಲೊಸ್ಟ್ರಮ್) ನೀಡಿ. ಜೇನುತುಪ್ಪ ಅಥವಾ ನೀರು ನೀಡಬೇಡಿ.',
          hi: 'जन्म के एक घंटे के भीतर माँ का पहला गाढ़ा पीला दूध पिलाएं। शिशु को शहद या पानी बिल्कुल न दें।',
        },
      },
    ],
  },
  {
    id: 'child-nutrition-vax',
    topic: 'Child Nutrition & Vaccination',
    title: {
      en: 'Child Immunization Schedule & Complementary Feeding',
      kn: 'ಮಕ್ಕಳ ಲಸಿಕಾ ವೇಳಾಪಟ್ಟಿ ಮತ್ತು 6 ತಿಂಗಳ ನಂತರದ ಪೌಷ್ಟಿಕ ಆಹಾರ',
      hi: 'बच्चों का टीकाकरण और 6 महीने बाद पूरक आहार',
    },
    subtitle: 'BCG to MR-2 vaccines, 6-month soft foods & monthly growth monitoring',
    coverImage: '/src/assets/images/video_child_nutrition_1795282333990.jpg',
    totalDurationSec: 36,
    chapters: [
      {
        durationSec: 12,
        visualCue: 'Birth, 6, 10, 14 weeks & 9-12 months routine vaccines',
        heading: {
          en: '1. Complete Free Routine Vaccinations on Time',
          kn: '1. ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ ಎಲ್ಲಾ ಉಚಿತ ಲಸಿಕೆಗಳನ್ನು ಕೊಡಿಸಿ',
          hi: '1. समय पर सभी मुफ़्त टीके लगवाएं',
        },
        explanation: {
          en: 'Give BCG, OPV-0, and HepB at birth; Pentavalent, OPV, Rotavirus, and IPV at 6, 10, and 14 weeks; and Measles-Rubella (MR-1) with Vitamin A at 9 months at your VHND session.',
          kn: 'ಹುಟ್ಟಿದ ತಕ್ಷಣ ಬಿಸಿಜಿ, 6-10-14 ವಾರಗಳಲ್ಲಿ ಪೆಂಟಾವೇಲೆಂಟ್ ಮತ್ತು 9ನೇ ತಿಂಗಳಲ್ಲಿ ಎಂಆರ್-1 ಲಸಿಕೆಯನ್ನು ಅಂಗನವಾಡಿ ಅಥವಾ ಪಿಎಚ್‌ಸಿಯಲ್ಲಿ ಉಚಿತವಾಗಿ ಕೊಡಿಸಿ.',
          hi: 'जन्म पर बीसीजी, 6-10-14 सप्ताह में पेंटावैलेंट और 9 महीने पर खसरा-रूबेला (एमआर-1) का टीका अवश्य लगवाएं।',
        },
      },
      {
        durationSec: 12,
        visualCue: 'Thick mashed dal-rice, greens, egg/fruit from 6 months',
        heading: {
          en: '2. Starting Thick Nutritious Foods at 6 Months',
          kn: '2. 6 ತಿಂಗಳ ನಂತರ ದಪ್ಪನೆಯ ಪೌಷ್ಟಿಕ ಆಹಾರ ಪ್ರಾರಂಭಿಸಿ',
          hi: '2. 6 महीने पूरे होने पर गाढ़ा पौष्टिक भोजन शुरू करें',
        },
        explanation: {
          en: 'After 6 months of exclusive breastfeeding, start mashed khichdi, ragi porridge, cooked vegetables, and seasonal fruits 3–4 times daily while continuing breastfeeding up to 2 years.',
          kn: '6 ತಿಂಗಳು ಕೇವಲ ತಾಯಿ ಹಾಲು ನೀಡಿದ ನಂತರ, ರಾಗಿ ಗಂಜಿ, ಬೇಳೆ-ಅನ್ನ, ತರಕಾರಿ ಮತ್ತು ಹಣ್ಣುಗಳನ್ನು ದಿನಕ್ಕೆ 3-4 ಬಾರಿ ನೀಡಿ.',
          hi: '6 महीने केवल माँ का दूध पिलाने के बाद खिचड़ी, दाल-चावल, मसली सब्ज़ी और फल दिन में 3–4 बार दें।',
        },
      },
      {
        durationSec: 12,
        visualCue: 'Weigh child monthly at Anganwadi Center',
        heading: {
          en: '3. Monthly Growth Chart Tracking',
          kn: '3. ಪ್ರತಿ ತಿಂಗಳು ತೂಕ ಮತ್ತು ಎತ್ತರದ ಬೆಳವಣಿಗೆ ಪರಿಶೀಲಿಸಿ',
          hi: '3. हर महीने आंगनवाड़ी में वजन और लंबाई की जांच',
        },
        explanation: {
          en: 'Check the child’s weight and height every month on the MCP growth chart. If weight stays flat or drops into the yellow or red zone, refer to PHC nutrition counseling.',
          kn: 'ಪ್ರತಿ ತಿಂಗಳು ಅಂಗನವಾಡಿಯಲ್ಲಿ ಮಗುವಿನ ತೂಕ ಅಳತೆ ಮಾಡಿಸಿ. ತೂಕ ಕಡಿಮೆಯಾದರೆ ತಕ್ಷಣ ಪೌಷ್ಟಿಕಾಂಶ ಸಲಹೆ ಪಡೆಯಿರಿ.',
          hi: 'हर महीने बच्चे का वजन ग्रोथ चार्ट पर जांचें। वजन न बढ़ने पर तुरंत स्वास्थ्य केंद्र से सलाह लें।',
        },
      },
    ],
  },
  {
    id: 'hygiene-wash',
    topic: 'Hygiene & Sanitation',
    title: {
      en: '5 Critical Times for Handwashing & Safe Water',
      kn: 'ಸಾಬೂನಿನಿಂದ ಕೈ ತೊಳೆಯುವ 5 ಮುಖ್ಯ ಸಮಯಗಳು ಮತ್ತು ಶುದ್ಧ ನೀರು',
      hi: 'साबुन से हाथ धोने के 5 ज़रूरी समय और सुरक्षित पानी',
    },
    subtitle: 'Preventing childhood diarrhoea, ORS preparation & covered water pots',
    coverImage: '/src/assets/images/video_hygiene_sanitation_1795282332737.jpg',
    totalDurationSec: 30,
    chapters: [
      {
        durationSec: 15,
        visualCue: 'Wash hands with soap for 20 seconds before feeding & after toilet',
        heading: {
          en: '1. Handwashing with Soap Prevents Diarrhoea',
          kn: '1. ಸಾಬೂನಿನಿಂದ ಕೈ ತೊಳೆಯುವುದರಿಂದ ಅತಿಸಾರ ತಡೆಯಬಹುದು',
          hi: '1. साबुन से हाथ धोकर दस्त से बचाव',
        },
        explanation: {
          en: 'Always wash hands with soap and clean water after using the toilet, after cleaning a child, and before cooking or feeding children. Keep drinking water covered and use a clean ladle.',
          kn: 'ಶೌಚಾಲಯ ಬಳಸಿದ ನಂತರ, ಮಗುವನ್ನು ಸ್ವಚ್ಛಗೊಳಿಸಿದ ನಂತರ ಹಾಗೂ ಅಡುಗೆ ಮತ್ತು ಊಟದ ಮೊದಲು ಸಾಬೂನಿನಿಂದ ಕೈ ತೊಳೆಯಿರಿ. ಕುಡಿಯುವ ನೀರನ್ನು ಯಾವಾಗಲೂ ಮುಚ್ಚಿಡಿ.',
          hi: 'शौच के बाद, बच्चे को साफ करने के बाद और खाना बनाने या खिलाने से पहले साबुन से हाथ धोएं। पीने का पानी ढककर रखें।',
        },
      },
      {
        durationSec: 15,
        visualCue: 'Mix 1 packet ORS in 1 litre clean water + Zinc for 14 days',
        heading: {
          en: '2. ORS & Zinc for Childhood Loose Motions',
          kn: '2. ಮಕ್ಕಳಿಗೆ ಬೇಧಿಯಾದಾಗ ಓಆರ್‌ಎಸ್ ಮತ್ತು ಜಿಂಕ್ ನೀಡಿ',
          hi: '2. दस्त में ओआरएस घोल और ज़िंक की गोली',
        },
        explanation: {
          en: 'At the first sign of diarrhoea, mix 1 full ORS packet in 1 litre of safe boiled-and-cooled water and give frequent small sips along with Zinc tablets for 14 days. Seek urgent care if child is lethargic or has sunken eyes.',
          kn: 'ಬೇಧಿ ಆರಂಭವಾದ ತಕ್ಷಣ 1 ಲೀಟರ್ ಶುದ್ಧ ನೀರಿನಲ್ಲಿ ಓಆರ್‌ಎಸ್ ಕಲಸಿ ಸ್ವಲ್ಪ ಸ್ವಲ್ಪ ಕುಡಿಸಿ ಮತ್ತು 14 ದಿನ ಜಿಂಕ್ ಮಾತ್ರೆ ನೀಡಿ.',
          hi: 'दस्त शुरू होते ही 1 लीटर साफ पानी में ओआरएस मिलाकर थोड़ी-थोड़ी देर में पिलाएं और 14 दिन ज़िंक दें।',
        },
      },
    ],
  },
  {
    id: 'disease-prevention',
    topic: 'Disease Prevention',
    title: {
      en: 'Preventing Dengue, Malaria & Fever Warning Signs',
      kn: 'ಡೆಂಗ್ಯೂ, ಮಲೇರಿಯಾ ತಡೆಗಟ್ಟುವಿಕೆ ಮತ್ತು ಜ್ವರದ ಎಚ್ಚರಿಕೆ ಲಕ್ಷಣಗಳು',
      hi: 'डेंगू, मलेरिया से बचाव और बुखार के खतरे के लक्षण',
    },
    subtitle: 'Dry day water checks, mosquito nets & when fever needs a blood test',
    coverImage: '/src/assets/images/video_disease_prevention_1795282333128.jpg',
    totalDurationSec: 30,
    chapters: [
      {
        durationSec: 15,
        visualCue: 'Empty stagnant water weekly & sleep under mosquito nets',
        heading: {
          en: '1. Weekly Dry Day & Mosquito Net Protection',
          kn: '1. ವಾರಕ್ಕೊಮ್ಮೆ ನಿಂತ ನೀರು ಸ್ವಚ್ಛಗೊಳಿಸಿ ಮತ್ತು ಸೊಳ್ಳೆ ಪರದೆ ಬಳಸಿ',
          hi: '1. हर हफ्ते रुका पानी साफ करें और मच्छरदानी लगाएं',
        },
        explanation: {
          en: 'Cover all water drums and empty water from coolers, flowerpots, and tyres once a week to stop Aedes dengue mosquitoes. Pregnant women and children should sleep under treated mosquito nets.',
          kn: 'ನೀರಿನ ತೊಟ್ಟಿಗಳನ್ನು ಮುಚ್ಚಿಡಿ ಮತ್ತು ವಾರಕ್ಕೊಮ್ಮೆ ನಿಂತ ನೀರನ್ನು ಖಾಲಿ ಮಾಡಿ. ಗರ್ಭಿಣಿಯರು ಮತ್ತು ಮಕ್ಕಳು ಸೊಳ್ಳೆ ಪರದೆ ಒಳಗೆ ಮಲಗಿ.',
          hi: 'पानी के बर्तन ढकें और हर सप्ताह कूलर व गमलों का पानी बदलें। गर्भवती महिलाएं और बच्चे मच्छरदानी में सोएं।',
        },
      },
      {
        durationSec: 15,
        visualCue: 'Test fever > 2 days at PHC; watch for breathing distress or rash',
        heading: {
          en: '2. When Fever Requires Immediate PHC Testing',
          kn: '2. 2 ದಿನಕ್ಕಿಂತ ಹೆಚ್ಚು ಜ್ವರ ಇದ್ದರೆ ಪಿಎಚ್‌ಸಿಯಲ್ಲಿ ರಕ್ತ ಪರೀಕ್ಷೆ ಮಾಡಿಸಿ',
          hi: '2. 2 दिन से अधिक बुखार होने पर पीएचसी में जांच कराएं',
        },
        explanation: {
          en: 'Any fever lasting over 2 days needs a rapid blood test for malaria or dengue at the PHC. Seek emergency medical care immediately for severe vomiting, bleeding, chest indrawing, or confusion.',
          kn: 'ಎರಡು ದಿನಕ್ಕಿಂತ ಹೆಚ್ಚು ಜ್ವರ ಇದ್ದರೆ ಪಿಎಚ್‌ಸಿಯಲ್ಲಿ ರಕ್ತ ಪರೀಕ್ಷೆ ಮಾಡಿಸಿ. ವಾಂತಿ, ರಕ್ತಸ್ರಾವ ಅಥವಾ ಉಸಿರಾಟದ ತೊಂದರೆ ಇದ್ದರೆ ತಕ್ಷಣ ಆಸ್ಪತ್ರೆಗೆ ತೆರಳಿ.',
          hi: 'दो दिन से अधिक बुखार रहने पर पीएचसी में मलेरिया/डेंगू की जांच कराएं। लगातार उल्टी या सांस लेने में तकलीफ पर तुरंत अस्पताल जाएं।',
        },
      },
    ],
  },
];

const TOPICS: VideoTopic[] = [
  'All Topics',
  'Maternal Health',
  'Pregnancy Care',
  'Child Nutrition & Vaccination',
  'Hygiene & Sanitation',
  'Disease Prevention',
];

export function ExplainWithVideo({ appLanguage }: ExplainWithVideoProps) {
  const displayLang: 'en' | 'kn' | 'hi' =
    appLanguage === 'kn' || appLanguage === 'hi' ? appLanguage : 'en';

  const [selectedTopic, setSelectedTopic] = useState<VideoTopic>('All Topics');
  const [activeLesson, setActiveLesson] = useState<HealthVideoLesson>(VIDEO_LESSONS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [narrationOn, setNarrationOn] = useState(true);
  const lastSpokenChapterRef = useRef<string>('');

  const filteredLessons =
    selectedTopic === 'All Topics'
      ? VIDEO_LESSONS
      : VIDEO_LESSONS.filter((l) => l.topic === selectedTopic);

  // Determine current chapter from elapsedSec
  let acc = 0;
  let chapterIdx = 0;
  for (let i = 0; i < activeLesson.chapters.length; i++) {
    acc += activeLesson.chapters[i].durationSec;
    if (elapsedSec < acc || i === activeLesson.chapters.length - 1) {
      chapterIdx = i;
      break;
    }
  }
  const currentChapter = activeLesson.chapters[chapterIdx];

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => {
        if (prev + 0.25 >= activeLesson.totalDurationSec) {
          setIsPlaying(false);
          return activeLesson.totalDurationSec;
        }
        return Number((prev + 0.25).toFixed(2));
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [isPlaying, activeLesson.totalDurationSec]);

  useEffect(() => {
    const key = `${activeLesson.id}-${chapterIdx}-${displayLang}`;
    if (isPlaying && narrationOn && lastSpokenChapterRef.current !== key) {
      lastSpokenChapterRef.current = key;
      const text = `${currentChapter.heading[displayLang]}. ${currentChapter.explanation[displayLang]}`;
      void speakTextWithFallback(text, displayLang);
    }
    if (!isPlaying) {
      stopAllSpeech();
      lastSpokenChapterRef.current = '';
    }
  }, [isPlaying, chapterIdx, activeLesson.id, displayLang, narrationOn, currentChapter]);

  useEffect(() => {
    return () => stopAllSpeech();
  }, []);

  const handleSelectLesson = (lesson: HealthVideoLesson) => {
    stopAllSpeech();
    setActiveLesson(lesson);
    setElapsedSec(0);
    setIsPlaying(false);
    lastSpokenChapterRef.current = '';
  };

  const handleTogglePlay = () => {
    if (elapsedSec >= activeLesson.totalDurationSec) {
      setElapsedSec(0);
      lastSpokenChapterRef.current = '';
      setIsPlaying(true);
    } else {
      setIsPlaying((p) => !p);
    }
  };

  const handleReplay = () => {
    stopAllSpeech();
    setElapsedSec(0);
    lastSpokenChapterRef.current = '';
    setIsPlaying(true);
  };

  const handleSeekChapter = (idx: number) => {
    let start = 0;
    for (let i = 0; i < idx; i++) start += activeLesson.chapters[i].durationSec;
    stopAllSpeech();
    lastSpokenChapterRef.current = '';
    setElapsedSec(start);
    setIsPlaying(true);
  };

  const progressPct = Math.min(100, (elapsedSec / activeLesson.totalDurationSec) * 100);
  const formatTime = (sec: number) => {
    const s = Math.floor(sec);
    return `0:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#5c6b64]">
            Visual Counselling Modules · Audio-Narrated Regional Explanations (English, Kannada &amp; Hindi)
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1c2421]">
            Explain with Video
          </h1>
        </div>
      </div>

      {/* Topic Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#dfe4dc] bg-white p-1.5">
        {TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            onClick={() => setSelectedTopic(topic)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              selectedTopic === topic
                ? 'bg-[#1f6f5c] text-white'
                : 'text-[#4c5b54] hover:bg-[#f4f6f2] hover:text-[#1c2421]'
            }`}
          >
            {topic}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Interactive Storyboard Video Player */}
        <section className="xl:col-span-8 rounded-xl border border-[#dfe4dc] bg-white overflow-hidden">
          <div className="relative aspect-video w-full bg-[#16201d] overflow-hidden">
            <img
              src={activeLesson.coverImage}
              alt={activeLesson.title.en}
              referrerPolicy="no-referrer"
              className={`h-full w-full object-cover transition-transform duration-1000 ${
                isPlaying ? 'scale-105' : 'scale-100'
              }`}
            />
            {/* Measured Contrast Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15" />

            {/* Top Chapter Indicator */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-xs text-white/90">
              <span className="font-medium">
                {activeLesson.topic} · Chapter {chapterIdx + 1} of {activeLesson.chapters.length}
              </span>
              <span className="font-mono tabular-nums">{currentChapter.visualCue}</span>
            </div>

            {/* Center Play Button Overlay when paused */}
            {!isPlaying && (
              <button
                type="button"
                onClick={handleTogglePlay}
                aria-label="Play educational video"
                className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1f6f5c]/95 text-white shadow-lg hover:bg-[#185a4b] transition-colors"
              >
                <Play className="h-7 w-7 translate-x-0.5" />
              </button>
            )}

            {/* Synchronized Regional Captions */}
            <div className="absolute bottom-4 left-5 right-5 space-y-1.5 text-white">
              <h2 className="text-base sm:text-lg font-bold leading-snug">
                {currentChapter.heading[displayLang]}
              </h2>
              <p className="text-xs sm:text-sm leading-relaxed text-white/90 max-w-3xl">
                {currentChapter.explanation[displayLang]}
              </p>
            </div>
          </div>

          {/* Video Transport & Scrubber Controls */}
          <div className="border-t border-[#e8ece6] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[#5c6b64] tabular-nums">
                {formatTime(elapsedSec)}
              </span>
              <input
                type="range"
                aria-label="Video timeline"
                min={0}
                max={activeLesson.totalDurationSec}
                step={0.5}
                value={elapsedSec}
                onChange={(e) => {
                  stopAllSpeech();
                  lastSpokenChapterRef.current = '';
                  setElapsedSec(Number(e.target.value));
                }}
                className="h-1.5 flex-1 cursor-pointer accent-[#1f6f5c]"
              />
              <span className="font-mono text-xs text-[#5c6b64] tabular-nums">
                {formatTime(activeLesson.totalDurationSec)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-medium text-white hover:bg-[#185a4b] whitespace-nowrap"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isPlaying ? 'Pause' : elapsedSec > 0 && elapsedSec < activeLesson.totalDurationSec ? 'Resume' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={handleReplay}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6ddd3] bg-white px-3.5 py-2 text-xs font-medium text-[#1c2421] hover:bg-[#f4f6f2] whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Replay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !narrationOn;
                    setNarrationOn(next);
                    if (!next) stopAllSpeech();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6ddd3] bg-white px-3.5 py-2 text-xs font-medium text-[#1c2421] hover:bg-[#f4f6f2] whitespace-nowrap"
                >
                  {narrationOn ? <Volume2 className="h-3.5 w-3.5 text-[#1f6f5c]" /> : <VolumeX className="h-3.5 w-3.5" />}
                  {narrationOn ? 'Voice Narration On' : 'Narration Muted'}
                </button>
              </div>

              <span className="text-xs text-[#5c6b64] font-mono tabular-nums">
                {Math.round(progressPct)}% watched
              </span>
            </div>

            {/* Chapter Jump List */}
            <div className="grid grid-cols-1 gap-2 border-t border-[#e8ece6] pt-3 sm:grid-cols-3">
              {activeLesson.chapters.map((ch, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSeekChapter(idx)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    chapterIdx === idx
                      ? 'border-[#1f6f5c] bg-[#edf6f3] text-[#185a4b]'
                      : 'border-[#e8ece6] bg-[#fafbf9] text-[#394741] hover:bg-[#f4f6f2]'
                  }`}
                >
                  <div className="font-semibold line-clamp-1">{ch.heading[displayLang]}</div>
                  <div className="mt-0.5 text-[11px] text-[#5c6b64] line-clamp-1">{ch.visualCue}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Video Playlist by Topic */}
        <aside className="xl:col-span-4 space-y-3">
          <p className="text-xs font-semibold text-[#5c6b64]">
            Educational Video Library ({filteredLessons.length})
          </p>
          <div className="space-y-3">
            {filteredLessons.map((lesson) => {
              const selected = lesson.id === activeLesson.id;
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => handleSelectLesson(lesson)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    selected
                      ? 'border-[#1f6f5c] bg-[#edf6f3]/60'
                      : 'border-[#dfe4dc] bg-white hover:border-[#b7c8bf]'
                  }`}
                >
                  <img
                    src={lesson.coverImage}
                    alt={lesson.title.en}
                    referrerPolicy="no-referrer"
                    className="h-16 w-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-[#1f6f5c]">
                      {lesson.topic} · {formatTime(lesson.totalDurationSec)}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-[#1c2421] line-clamp-2">
                      {lesson.title[displayLang]}
                    </div>
                    <div className="mt-0.5 text-xs text-[#5c6b64] line-clamp-1">
                      {lesson.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
