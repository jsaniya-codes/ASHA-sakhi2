import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Baby,
  Bell,
  CalendarDays,
  ClipboardList,
  Database,
  FileBarChart2,
  FileText,
  Globe,
  History,
  Home,
  Loader2,
  LogOut,
  Menu,
  Mic,
  PlaySquare,
  Stethoscope,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AuthPortal, type AuthScreen } from './components/AuthPortal';
import { CommunitySurveys } from './components/CommunitySurveys';
import { DangerAlerts } from './components/DangerAlerts';
import { DataFiles } from './components/DataFiles';
import { ExplainWithVideo } from './components/ExplainWithVideo';
import { HealthCheckup } from './components/HealthCheckup';
import { HealthHistories } from './components/HealthHistories';
import { MaternalAndChild } from './components/MaternalAndChild';
import { PatientNotifications, type NotificationPrefill } from './components/PatientNotifications';
import { PeopleDirectory } from './components/PeopleDirectory';
import { ReportsDashboard } from './components/ReportsDashboard';
import { ScheduleCalendar } from './components/ScheduleCalendar';
import { SpeakAndRecord } from './components/SpeakAndRecord';
import { StateOverview } from './components/StateOverview';
import { VillageFamilies } from './components/VillageFamilies';
import { VisitRegister } from './components/VisitRegister';
import { parseApiResponse } from './utils/apiClient';
import {
  APP_LANGUAGE_OPTIONS,
  getUiText,
  setSpeechAuthToken,
  speakTextWithFallback,
  stopAllSpeech,
  subscribeSpeechStatus,
} from './utils/i18n';
import type {
  ActiveWorkspaceView,
  AppLanguage,
  AppointmentRecord,
  AuthUser,
  CallLogRecord,
  ChildRecord,
  CommunitySurvey,
  DangerAlert,
  DatasetImportLog,
  FamilyRecord,
  FieldVisit,
  FontScale,
  HealthCheckupRecord,
  HealthIndicator,
  MaternalRecord,
  NotificationCategory,
  NotificationRecord,
  PersonRecord,
  ReportsSummary,
  VoiceInteractionRecord,
} from './types';

const PAGE_AUDIO_GUIDES: Record<ActiveWorkspaceView, string> = {
  'speak-record':
    'Speak and Record. Tap Start Voice Recording to speak in your regional language or English, get plain healthcare guidance, listen to the response, or save the visit.',
  'explain-video':
    'Explain with Video. Choose a maternal health, child vaccination, hygiene, or disease prevention lesson to watch and listen with village families.',
  'visit-register':
    'Visit Register. View, filter, add, update, and export household health visits with follow-up dates and observations.',
  'schedule-calendar':
    'Smart Schedule Calendar. View monthly, weekly, and daily schedules for home visits, antenatal checkups, vaccinations, and follow-ups, track overdue visits, and send reminders.',
  'danger-alerts':
    'Danger Alerts. Check maternal, child, or fever emergency warning signs. For any danger sign, call 108 ambulance or escort the patient to a PHC or FRU doctor immediately.',
  'maternal-child':
    'Maternal and Child Health. Track pregnancies, ANC visits, iron folic acid tablets, high-risk mothers, child vaccinations, and growth measurements.',
  'village-families':
    'Village Families. Add, edit, and manage village households, drinking water and sanitation records, and linked family members.',
  'people-directory':
    'People Directory. Search individuals by name or ID, filter by village and age group, call patients directly, record call outcomes, and generate individual PDF health reports.',
  'patient-notifications':
    'Patient Notifications. Send SMS or WhatsApp appointment reminders, ANC and vaccination reminders, and health updates in regional languages after previewing and confirming patient consent.',
  'community-surveys':
    'Community Surveys. Create household questionnaires, collect village survey responses, and download survey reports.',
  'health-checkup':
    'Health Checkup. Record blood pressure, temperature, weight, blood sugar, hemoglobin, and oxygen levels with automatic clinical reference alerts.',
  'health-histories':
    'Health Histories. View a complete chronological timeline of visits, maternal and child records, checkups, danger alerts, and saved voice consultations.',
  reports:
    'Reports. Review live totals of families, people, visits, pregnancies, vaccinations, and alerts, and download PDF or Excel reports.',
  'state-overview':
    'State Overview. Compare official Karnataka NFHS-5 statistics alongside locally collected AshaSakhi field records and the interactive area map.',
  'data-files':
    'Data Files. Upload verified public health CSV, Excel, or JSON datasets, preview before importing, and inspect all 16 metadata provenance fields.',
};

function resolveRouteFromPathname(pathname: string): AuthScreen | 'dashboard' {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/login') return 'login';
  if (clean === '/register') return 'register';
  if (clean === '/forgot-password') return 'forgot-password';
  if (clean === '/dashboard' || clean.startsWith('/dashboard/')) return 'dashboard';
  return 'welcome';
}

function pathForAuthScreen(screen: AuthScreen): string {
  if (screen === 'login') return '/login';
  if (screen === 'register') return '/register';
  if (screen === 'forgot-password') return '/forgot-password';
  return '/';
}

function formatRoleLabel(role: AuthUser['role']): string {
  return role === 'supervisor' ? 'Healthcare Administrator' : 'ASHA Worker';
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveWorkspaceView>('speak-record');
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('en');
  const [fontScale, setFontScale] = useState<FontScale>('normal');
  const [isSpeakingPage, setIsSpeakingPage] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth & route guard state (no credentials or passwords stored in localStorage)
  const [authChecking, setAuthChecking] = useState(true);
  const [authScreen, setAuthScreen] = useState<AuthScreen>(() => {
    const initial = resolveRouteFromPathname(window.location.pathname);
    return initial === 'dashboard' ? 'login' : initial;
  });
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // All module datasets backed by SQLite (loaded strictly after authentication)
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [alerts, setAlerts] = useState<DangerAlert[]>([]);
  const [maternalRecords, setMaternalRecords] = useState<MaternalRecord[]>([]);
  const [childRecords, setChildRecords] = useState<ChildRecord[]>([]);
  const [surveys, setSurveys] = useState<CommunitySurvey[]>([]);
  const [checkups, setCheckups] = useState<HealthCheckupRecord[]>([]);
  const [voiceInteractions, setVoiceInteractions] = useState<VoiceInteractionRecord[]>([]);
  const [indicators, setIndicators] = useState<HealthIndicator[]>([]);
  const [datasetImports, setDatasetImports] = useState<DatasetImportLog[]>([]);
  const [reportsSummary, setReportsSummary] = useState<ReportsSummary | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [callLogs, setCallLogs] = useState<CallLogRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  // Cross-module navigation bridges (Calendar <-> Patient Profile <-> Notifications)
  const [profileFocusPersonId, setProfileFocusPersonId] = useState<number | null>(null);
  const [calendarPreselectPersonId, setCalendarPreselectPersonId] = useState<number | null>(null);
  const [notificationPrefill, setNotificationPrefill] = useState<NotificationPrefill | null>(null);

  const ui = getUiText(appLanguage);

  const clearDashboardData = useCallback(() => {
    setVisits([]);
    setFamilies([]);
    setPeople([]);
    setAlerts([]);
    setMaternalRecords([]);
    setChildRecords([]);
    setSurveys([]);
    setCheckups([]);
    setVoiceInteractions([]);
    setIndicators([]);
    setDatasetImports([]);
    setReportsSummary(null);
    setAppointments([]);
    setCallLogs([]);
    setNotifications([]);
    setProfileFocusPersonId(null);
    setCalendarPreselectPersonId(null);
    setNotificationPrefill(null);
  }, []);

  const navigateAuthScreen = useCallback((next: AuthScreen, replace = false) => {
    setAuthScreen(next);
    if (next !== 'login') {
      setAuthNotice(null);
    }
    const targetPath = pathForAuthScreen(next);
    if (window.location.pathname !== targetPath) {
      if (replace) {
        window.history.replaceState(null, '', targetPath);
      } else {
        window.history.pushState(null, '', targetPath);
      }
    }
  }, []);

  const loadAllData = useCallback(
    async (explicitToken?: string | null) => {
      const tokenToUse = explicitToken !== undefined ? explicitToken : authToken;
      setLoadingAll(true);
      try {
        let sessionExpired = false;
        const fetchJson = async <T,>(url: string, fallback: T): Promise<T> => {
          try {
            const res = await fetch(url, {
              credentials: 'same-origin',
              headers: {
                Accept: 'application/json',
                ...(tokenToUse ? { Authorization: `Bearer ${tokenToUse}` } : {}),
              },
            });
            if (res.status === 401) {
              sessionExpired = true;
              return fallback;
            }
            return await parseApiResponse<T>(res, `Failed loading ${url}`);
          } catch {
            return fallback;
          }
        };

        const [
          visitsRes,
          familiesRes,
          peopleRes,
          alertsRes,
          maternalRes,
          childrenRes,
          surveysRes,
          checkupsRes,
          voiceRes,
          dataFilesRes,
          summaryRes,
          appointmentsRes,
          callsRes,
          notificationsRes,
        ] = await Promise.all([
          fetchJson<{ visits?: FieldVisit[] }>('/api/visits', { visits: [] }),
          fetchJson<{ families?: FamilyRecord[] }>('/api/families', { families: [] }),
          fetchJson<{ people?: PersonRecord[] }>('/api/people', { people: [] }),
          fetchJson<{ alerts?: DangerAlert[] }>('/api/alerts', { alerts: [] }),
          fetchJson<{ records?: MaternalRecord[] }>('/api/maternal', { records: [] }),
          fetchJson<{ records?: ChildRecord[] }>('/api/children', { records: [] }),
          fetchJson<{ surveys?: CommunitySurvey[] }>('/api/surveys', { surveys: [] }),
          fetchJson<{ checkups?: HealthCheckupRecord[] }>('/api/checkups', { checkups: [] }),
          fetchJson<{ interactions?: VoiceInteractionRecord[] }>('/api/voice-interactions', {
            interactions: [],
          }),
          fetchJson<{ indicators?: HealthIndicator[]; imports?: DatasetImportLog[] }>(
            '/api/data-files/indicators',
            { indicators: [], imports: [] }
          ),
          fetchJson<ReportsSummary | null>('/api/reports/summary', null),
          fetchJson<{ appointments?: AppointmentRecord[] }>('/api/appointments', { appointments: [] }),
          fetchJson<{ calls?: CallLogRecord[] }>('/api/calls', { calls: [] }),
          fetchJson<{ notifications?: NotificationRecord[] }>('/api/notifications', { notifications: [] }),
        ]);

        if (sessionExpired) {
          stopAllSpeech();
          setSpeechAuthToken(null);
          setCurrentUser(null);
          setAuthToken(null);
          clearDashboardData();
          setAuthNotice('Your session has expired. Please sign in again.');
          navigateAuthScreen('login', true);
          return;
        }

        setVisits(visitsRes.visits || []);
        setFamilies(familiesRes.families || []);
        setPeople(peopleRes.people || []);
        setAlerts(alertsRes.alerts || []);
        setMaternalRecords(maternalRes.records || []);
        setChildRecords(childrenRes.records || []);
        setSurveys(surveysRes.surveys || []);
        setCheckups(checkupsRes.checkups || []);
        setVoiceInteractions(voiceRes.interactions || []);
        setIndicators(dataFilesRes.indicators || []);
        setDatasetImports(dataFilesRes.imports || []);
        setReportsSummary(summaryRes);
        setAppointments(appointmentsRes.appointments || []);
        setCallLogs(callsRes.calls || []);
        setNotifications(notificationsRes.notifications || []);
      } finally {
        setLoadingAll(false);
      }
    },
    [authToken, clearDashboardData, navigateAuthScreen]
  );

  // Verify existing server-side HttpOnly session on initial load & refresh (never auto-logs in)
  useEffect(() => {
    let cancelled = false;
    const requestedRoute = resolveRouteFromPathname(window.location.pathname);

    (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!cancelled && res.ok) {
          const data = await parseApiResponse<{ user: AuthUser; token: string }>(
            res,
            'Session check failed.'
          );
          setCurrentUser(data.user);
          setAuthToken(data.token);
          setSpeechAuthToken(data.token);
          setAuthNotice(null);
          if (requestedRoute !== 'dashboard') {
            window.history.replaceState(null, '', '/dashboard');
          }
          await loadAllData(data.token);
          return;
        }
      } catch {
        // Stay unauthenticated
      }

      if (!cancelled) {
        setSpeechAuthToken(null);
        setCurrentUser(null);
        setAuthToken(null);
        if (requestedRoute === 'dashboard') {
          setAuthNotice('Please sign in to access the AshaSakhi dashboard.');
          navigateAuthScreen('login', true);
        } else {
          setAuthScreen(requestedRoute);
        }
      }
    })().finally(() => {
      if (!cancelled) setAuthChecking(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enforce route protection on browser Back / Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const next = resolveRouteFromPathname(window.location.pathname);
      if (!currentUser) {
        if (next === 'dashboard') {
          setAuthNotice('Please sign in to access the AshaSakhi dashboard.');
          navigateAuthScreen('login', true);
        } else {
          setAuthScreen(next);
        }
      } else if (next !== 'dashboard') {
        window.history.replaceState(null, '', '/dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentUser, navigateAuthScreen]);

  // Apply accessibility font scale class to document root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('font-scale-large', 'font-scale-xlarge');
    if (fontScale === 'large') root.classList.add('font-scale-large');
    if (fontScale === 'xlarge') root.classList.add('font-scale-xlarge');
  }, [fontScale]);

  const handleCycleFontScale = () => {
    setFontScale((prev) => (prev === 'normal' ? 'large' : prev === 'large' ? 'xlarge' : 'normal'));
  };

  useEffect(() => {
    return subscribeSpeechStatus((status) => {
      if (status === 'idle') {
        setIsSpeakingPage(false);
      }
    });
  }, []);

  const handleToggleListenToPage = () => {
    if (isSpeakingPage) {
      stopAllSpeech();
      setIsSpeakingPage(false);
      return;
    }
    const text = PAGE_AUDIO_GUIDES[activeView];
    setIsSpeakingPage(true);
    void speakTextWithFallback(
      text,
      appLanguage,
      () => setIsSpeakingPage(true),
      () => setIsSpeakingPage(false)
    );
  };

  const handleAuthenticated = (user: AuthUser, token: string) => {
    setCurrentUser(user);
    setAuthToken(token);
    setSpeechAuthToken(token);
    setAuthNotice(null);
    setActiveView('speak-record');
    window.history.pushState(null, '', '/dashboard');
    void loadAllData(token);
  };

  const handleSignOut = async () => {
    stopAllSpeech();
    setIsSpeakingPage(false);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
    } catch {
      // Ignore network errors on sign out
    }
    setSpeechAuthToken(null);
    setCurrentUser(null);
    setAuthToken(null);
    setMobileMenuOpen(false);
    clearDashboardData();
    setAuthNotice(null);
    navigateAuthScreen('welcome', true);
  };

  const handleRequestAuth = () => {
    setAuthNotice('Please sign in to continue.');
    navigateAuthScreen('login', true);
  };

  const activeAlertCount = alerts.filter((a) => a.status !== 'Resolved').length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueAppointmentCount = appointments.filter(
    (a) => a.status === 'Scheduled' && a.appointment_date < todayIso
  ).length;

  const mainNavItems: Array<{
    id: ActiveWorkspaceView;
    label: string;
    tileBg: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'speak-record',
      label: ui.nav['speak-record'],
      tileBg: 'bg-[#1f6f5c] text-white',
      icon: <Mic className="h-4 w-4" />,
    },
    {
      id: 'explain-video',
      label: ui.nav['explain-video'],
      tileBg: 'bg-[#b76d49] text-white',
      icon: <PlaySquare className="h-4 w-4" />,
    },
    {
      id: 'visit-register',
      label: ui.nav['visit-register'],
      tileBg: 'bg-[#2c7a7b] text-white',
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      id: 'schedule-calendar',
      label: ui.nav['schedule-calendar'],
      tileBg: 'bg-[#2a6f97] text-white',
      icon: <CalendarDays className="h-4 w-4" />,
      badge: overdueAppointmentCount > 0 ? overdueAppointmentCount : undefined,
    },
    {
      id: 'danger-alerts',
      label: ui.nav['danger-alerts'],
      tileBg: 'bg-[#b83232] text-white',
      icon: <AlertTriangle className="h-4 w-4" />,
      badge: activeAlertCount > 0 ? activeAlertCount : undefined,
    },
    {
      id: 'maternal-child',
      label: ui.nav['maternal-child'],
      tileBg: 'bg-[#5a67b8] text-white',
      icon: <Baby className="h-4 w-4" />,
    },
  ];

  const moreRecordItems: Array<{
    id: ActiveWorkspaceView;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'village-families', label: ui.nav['village-families'], icon: <Home className="h-4 w-4" /> },
    { id: 'people-directory', label: ui.nav['people-directory'], icon: <Users className="h-4 w-4" /> },
    { id: 'patient-notifications', label: ui.nav['patient-notifications'], icon: <Bell className="h-4 w-4" /> },
    { id: 'community-surveys', label: ui.nav['community-surveys'], icon: <FileText className="h-4 w-4" /> },
    { id: 'health-checkup', label: ui.nav['health-checkup'], icon: <Stethoscope className="h-4 w-4" /> },
    { id: 'health-histories', label: ui.nav['health-histories'], icon: <History className="h-4 w-4" /> },
    { id: 'reports', label: ui.nav.reports, icon: <FileBarChart2 className="h-4 w-4" /> },
    { id: 'state-overview', label: ui.nav['state-overview'], icon: <Activity className="h-4 w-4" /> },
    { id: 'data-files', label: ui.nav['data-files'], icon: <Database className="h-4 w-4" /> },
  ];

  const handleSelectNav = (id: ActiveWorkspaceView) => {
    setActiveView(id);
    setMobileMenuOpen(false);
    if (isSpeakingPage) {
      stopAllSpeech();
      setIsSpeakingPage(false);
    }
  };

  const handleOpenPatientProfile = (personId: number) => {
    setProfileFocusPersonId(personId);
    handleSelectNav('people-directory');
  };

  const handleScheduleForPatient = (personId: number) => {
    setCalendarPreselectPersonId(personId);
    handleSelectNav('schedule-calendar');
  };

  const handleNotifyPatient = (
    personId: number,
    category?: NotificationCategory,
    appointment?: AppointmentRecord
  ) => {
    setNotificationPrefill({ personId, category, appointment });
    handleSelectNav('patient-notifications');
  };

  const handleSendAppointmentReminder = (appointment: AppointmentRecord) => {
    const category: NotificationCategory =
      appointment.appointment_type === 'Antenatal Checkup'
        ? 'ANC Checkup Reminder'
        : appointment.appointment_type === 'Vaccination'
        ? 'Vaccination Reminder'
        : appointment.appointment_type === 'Follow-up Visit'
        ? 'Follow-up Notification'
        : 'Appointment Reminder';
    handleNotifyPatient(appointment.person_id, category, appointment);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#f4f6f2] border-r border-[#e2e7e0]">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[#e2e7e0]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1f6f5c] text-sm font-bold text-white tracking-tight">
          AS
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 leading-tight">AshaSakhi</div>
          <div className="truncate text-[11px] text-slate-500">{ui.tagline}</div>
        </div>
      </div>

      {/* Scrollable Menu Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {ui.mainActions}
          </p>
          <div className="mt-2 space-y-1.5">
            {mainNavItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs ring-1 ring-[#d7dfd5]'
                      : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${item.tileBg}`}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="font-mono text-[11px] font-bold text-red-700 tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {ui.moreRecords}
          </p>
          <div className="mt-2 space-y-0.5">
            {moreRecordItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'bg-white font-semibold text-[#1f6f5c] shadow-xs ring-1 ring-[#d7dfd5]'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                  }`}
                >
                  <span className={active ? 'text-[#1f6f5c]' : 'text-slate-400'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Bottom Authenticated User Profile & Logout Footer */}
      {currentUser && (
        <div className="border-t border-[#e2e7e0] p-3">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-[#e2e7e0]">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900">{currentUser.full_name}</p>
              <p className="truncate text-[11px] text-slate-500">
                {formatRoleLabel(currentUser.role)} · {currentUser.district}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title={ui.signOut}
              aria-label="Log out"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Brief neutral loading screen while verifying server session (never flashes dashboard)
  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f9f7] px-4">
        <div className="flex items-center gap-3 rounded-xl border border-[#dce8e3] bg-white px-5 py-4 text-sm font-medium text-[#2c443e]">
          <Loader2 className="h-4 w-4 animate-spin text-[#1f6f5c]" />
          <span>Loading AshaSakhi...</span>
        </div>
      </div>
    );
  }

  // Strict Authentication Gate: unauthenticated users only see Welcome / Sign In / Register / Reset
  if (!currentUser) {
    return (
      <AuthPortal
        screen={authScreen}
        notice={authNotice}
        onNavigate={(next) => navigateAuthScreen(next)}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f4f6f2] text-slate-900">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 w-64 max-w-[85vw]">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-3 z-20 rounded-lg bg-white p-1.5 text-slate-600 shadow-sm"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        {/* Top Utility Header matching screenshot */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e7e0] bg-[#f4f6f2]/95 px-4 py-3.5 backdrop-blur-xs sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ASHASAKHI</p>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">
                {ui.nav[activeView]}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Listen to page */}
            <button
              type="button"
              onClick={handleToggleListenToPage}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                isSpeakingPage
                  ? 'border-[#1f6f5c] bg-[#1f6f5c]/10 text-[#1f6f5c]'
                  : 'border-[#d7dfd5] bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isSpeakingPage ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {isSpeakingPage ? ui.stopListening : ui.listenToPage}
            </button>

            {/* Font Size Toggle */}
            <button
              type="button"
              onClick={handleCycleFontScale}
              title={`Text size: ${fontScale}. Click to switch normal / large / extra large.`}
              className="inline-flex items-center gap-1 rounded-lg border border-[#d7dfd5] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <span className="text-[11px]">A</span>
              <span className="text-sm leading-none">A</span>
              <span className="ml-0.5 text-[10px] uppercase text-slate-400">
                {fontScale === 'normal' ? '1x' : fontScale === 'large' ? '1.15x' : '1.3x'}
              </span>
            </button>

            {/* Language Selector */}
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#d7dfd5] bg-white px-2.5 py-1.5">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <select
                aria-label="Select interface and voice language"
                value={appLanguage}
                onChange={(e) => setAppLanguage(e.target.value as AppLanguage)}
                className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
              >
                {APP_LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Primary Speak & Record Action */}
            <button
              type="button"
              onClick={() => handleSelectNav('speak-record')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#185848] transition-colors whitespace-nowrap"
            >
              <Mic className="h-3.5 w-3.5" />
              {ui.nav['speak-record']}
            </button>

            {/* Logged-in User Display & Logout */}
            <div className="hidden sm:flex items-center gap-2 border-l border-[#d7dfd5] pl-2.5">
              <span className="max-w-[140px] truncate text-xs font-semibold text-slate-800">
                {currentUser.full_name}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d7dfd5] bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
                {ui.signOut}
              </button>
            </div>
          </div>
        </header>

        {/* Active Module Workspace */}
        <main className="mx-auto w-full max-w-[1380px] flex-1 px-4 py-6 sm:px-6">
          {activeView === 'speak-record' && (
            <SpeakAndRecord
              appLanguage={appLanguage}
              onChangeAppLanguage={setAppLanguage}
              initialDistrict={currentUser?.district || 'Raichur'}
              currentUser={currentUser}
              authToken={authToken}
              people={people}
              onRequestAuth={handleRequestAuth}
              onVisitSaved={async () => {
                await loadAllData();
              }}
              onVoiceInteractionSaved={async () => {
                await loadAllData();
              }}
              onAlertCreated={async () => {
                await loadAllData();
              }}
            />
          )}

          {activeView === 'explain-video' && <ExplainWithVideo appLanguage={appLanguage} />}

          {activeView === 'visit-register' && (
            <VisitRegister
              visits={visits}
              families={families}
              people={people}
              currentUser={currentUser}
              authToken={authToken}
              onRequestAuth={handleRequestAuth}
              onVisitCreated={() => {
                void loadAllData();
              }}
              onVisitUpdated={() => {
                void loadAllData();
              }}
              onVisitDeleted={() => {
                void loadAllData();
              }}
              onRefresh={loadAllData}
            />
          )}

          {activeView === 'schedule-calendar' && (
            <ScheduleCalendar
              appointments={appointments}
              people={people}
              authToken={authToken}
              preselectedPersonId={calendarPreselectPersonId}
              onClearPreselectedPerson={() => setCalendarPreselectPersonId(null)}
              onRequestAuth={handleRequestAuth}
              onRefresh={loadAllData}
              onOpenPatientProfile={handleOpenPatientProfile}
              onSendReminder={handleSendAppointmentReminder}
            />
          )}

          {activeView === 'danger-alerts' && (
            <DangerAlerts
              alerts={alerts}
              people={people}
              currentUser={currentUser}
              authToken={authToken}
              onRequestAuth={handleRequestAuth}
              onAlertCreated={() => {
                void loadAllData();
              }}
              onAlertUpdated={() => {
                void loadAllData();
              }}
            />
          )}

          {activeView === 'maternal-child' && (
            <MaternalAndChild
              maternalRecords={maternalRecords}
              childRecords={childRecords}
              people={people}
              user={currentUser}
              authToken={authToken}
              onRequestAuth={handleRequestAuth}
              onRefresh={loadAllData}
            />
          )}

          {activeView === 'village-families' && (
            <VillageFamilies
              families={families}
              people={people}
              user={currentUser}
              authToken={authToken}
              onRequestAuth={handleRequestAuth}
              onRefresh={loadAllData}
            />
          )}

          {activeView === 'people-directory' && (
            <PeopleDirectory
              people={people}
              families={families}
              visits={visits}
              checkups={checkups}
              alerts={alerts}
              appointments={appointments}
              callLogs={callLogs}
              user={currentUser}
              authToken={authToken}
              initialSelectedPersonId={profileFocusPersonId}
              onClearInitialSelectedPerson={() => setProfileFocusPersonId(null)}
              onScheduleForPatient={handleScheduleForPatient}
              onNotifyPatient={(personId) => handleNotifyPatient(personId, 'Recent Health Update')}
              onRequestAuth={handleRequestAuth}
              onRefresh={loadAllData}
            />
          )}

          {activeView === 'patient-notifications' && (
            <PatientNotifications
              people={people}
              notifications={notifications}
              appointments={appointments}
              appLanguage={appLanguage}
              authToken={authToken}
              prefill={notificationPrefill}
              onClearPrefill={() => setNotificationPrefill(null)}
              onRequestAuth={handleRequestAuth}
              onRefresh={loadAllData}
            />
          )}

          {activeView === 'community-surveys' && (
            <CommunitySurveys
              surveys={surveys}
              families={families}
              user={currentUser}
              authToken={authToken}
              onRequestAuth={handleRequestAuth}
              onRefresh={loadAllData}
            />
          )}

          {activeView === 'health-checkup' && (
            <HealthCheckup
              checkups={checkups}
              people={people}
              user={currentUser}
              authToken={authToken}
              onRequestAuth={handleRequestAuth}
              onRefresh={loadAllData}
            />
          )}

          {activeView === 'health-histories' && (
            <HealthHistories
              people={people}
              visits={visits}
              maternalRecords={maternalRecords}
              childRecords={childRecords}
              checkups={checkups}
              alerts={alerts}
              voiceInteractions={voiceInteractions}
              appLanguage={appLanguage}
            />
          )}

          {activeView === 'reports' && (
            <ReportsDashboard
              summary={reportsSummary}
              loading={loadingAll}
              onRefresh={loadAllData}
            />
          )}

          {activeView === 'state-overview' && (
            <StateOverview
              indicators={indicators}
              summary={reportsSummary}
              visits={visits}
            />
          )}

          {activeView === 'data-files' && (
            <DataFiles
              indicators={indicators}
              imports={datasetImports}
              user={currentUser}
              authToken={authToken}
              onRequestAuth={handleRequestAuth}
              onRefresh={loadAllData}
            />
          )}
        </main>
      </div>
    </div>
  );
}
