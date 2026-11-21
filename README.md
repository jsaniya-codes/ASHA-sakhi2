# 🌸 AshaSakhi AI – AI-Powered Healthcare Assistant

**Empowering ASHA Workers | Improving Maternal & Child Healthcare**

AshaSakhi AI is an AI-powered, multilingual healthcare assistant designed to support ASHA (Accredited Social Health Activist) workers in rural and underserved communities. It helps simplify daily healthcare activities, manage patient information, support maternal and child health monitoring, and improve communication between ASHA workers and patients.

The platform combines AI technology, voice assistance, digital patient records, and smart reminders to reduce manual workload and make community healthcare more accessible.

## 🌟 Key Features

### 1. AI Healthcare Assistant
- AI-powered healthcare assistance using the Qwen AI API.
- Provides healthcare-related information and guidance.
- Supports ASHA workers in their daily activities.

### 2. Multilingual Voice Assistant
- Supports multiple languages.
- Voice-based interaction for easier communication.
- Voice-to-text support for patient information entry.
- Helps users who face difficulties with typing.

### 3. Patient Management
- Register and manage patient information.
- Maintain digital patient records.
- Access individual patient profiles.
- Organize patient health information.

### 4. Maternal Healthcare Monitoring
- Pregnancy-related information tracking.
- Antenatal Care (ANC) monitoring.
- Pregnancy risk alerts for professional review.
- Follow-up tracking for pregnant women.

### 5. Child Healthcare Monitoring
- Vaccination tracking.
- Child health record management.
- Immunization reminders.
- Follow-up support.

### 6. Appointment & Schedule Calendar
- Schedule patient home visits.
- Manage ANC checkups and vaccination appointments.
- View upcoming and overdue appointments.
- Update or reschedule appointments.

### 7. Patient Calling
- One-tap patient calling.
- Opens the device's normal phone dialer.
- Record call outcomes and follow-up notes.

### 8. SMS & WhatsApp Notifications
- Patient reminders through SMS and WhatsApp.
- Appointment and follow-up notifications.
- Regional-language message support.
- Notification history.

### 9. Individual Patient PDF Reports
- Generate patient-specific PDF reports.
- View and download patient health summaries.
- Organize important patient information into readable reports.

## 🛠️ Technologies Used

| Technology | Purpose |
|---|---|
| Qwen AI API | AI-powered healthcare assistance |
| Vercel | Application deployment and hosting |
| Twilio | SMS and WhatsApp communication, if configured |
| JavaScript / TypeScript | Application development, as applicable |
| HTML / CSS | User interface, as applicable |
| Database | Patient data storage, according to project configuration |

## 🏗️ Project Architecture

1. **Frontend:** Provides the user interface for ASHA workers.
2. **Backend:** Handles application logic, data processing, and API requests.
3. **AI Integration:** Uses the Qwen AI API to provide AI-powered assistance.
4. **Database:** Stores and manages patient information.
5. **Communication:** Supports SMS and WhatsApp through Twilio, when configured.
6. **Deployment:** Hosted using Vercel.

## 🚀 Live Deployment

**Live Application:** [Add your Vercel deployment URL here]

## 💻 Getting Started

### Prerequisites
- Node.js and npm
- Git
- Required API credentials
- Database configuration, if applicable

### Installation

1. Clone the repository:

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
```

2. Open the project folder:

```bash
cd AshaSakhi-AI
```

3. Install dependencies:

```bash
npm install
```

4. Configure the environment variables required by your project in a local `.env` file.

Example variable names (use the exact names expected by your code):

```env
QWEN_API_KEY=your_qwen_api_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_SMS_FROM=your_twilio_sms_number
TWILIO_WHATSAPP_FROM=your_twilio_whatsapp_sender
```

5. Start the development server using the script defined in your `package.json`:

```bash
npm run dev
```

## ☁️ Deployment on Vercel

AshaSakhi AI is deployed using Vercel.

Deployment steps:
1. Connect the GitHub repository to Vercel.
2. Configure the required environment variables in Vercel Project Settings.
3. Select the correct framework and build settings for the project.
4. Deploy the application.
5. Test the live application and its backend API integrations.

**Important:** Never expose API keys, authentication tokens, or database credentials in frontend code or commit them to GitHub.

## 🔐 Privacy & Safety

- Patient information should be handled securely.
- Obtain appropriate consent before collecting or sharing patient information.
- AI-generated guidance is for assistance and information only.
- AshaSakhi AI does not replace doctors or qualified healthcare professionals.
- AI-generated risk alerts must be reviewed by appropriate healthcare professionals.
- Do not use AI responses as a substitute for medical diagnosis or prescriptions.

## 🎯 Project Objectives

- Reduce the manual workload of ASHA workers.
- Improve maternal and child healthcare monitoring.
- Support regional-language communication.
- Simplify patient record management.
- Improve appointment and follow-up tracking.
- Strengthen community-level healthcare support through AI.

## 🔮 Future Enhancements

- Improved offline functionality and automatic synchronization.
- Integration with more healthcare systems.
- Advanced healthcare analytics and dashboards.
- Enhanced patient follow-up and notification management.
- Additional regional languages.

## 👩‍💻 Project Team

Developed as a healthcare technology project to support ASHA workers and strengthen community healthcare services.

## ❤️ Acknowledgement

AshaSakhi AI aims to bridge the gap between technology and community healthcare by making digital healthcare assistance more accessible, simple, and efficient.

**AshaSakhi AI – Supporting ASHA Workers, Caring for Every Community.**
