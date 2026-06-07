import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('sportsTipsDesktop', {
  getStatus: () => ipcRenderer.invoke('desktop:get-status'),
  startDaemon: () => ipcRenderer.invoke('desktop:start-daemon'),
  stopDaemon: () => ipcRenderer.invoke('desktop:stop-daemon'),
  reviewResults: () => ipcRenderer.invoke('desktop:review-results'),
  forceDailyCheck: () => ipcRenderer.invoke('desktop:force-daily-check'),
  forcePostSlates: () => ipcRenderer.invoke('desktop:force-post-slates'),
  forcePostPicks: () => ipcRenderer.invoke('desktop:force-post-picks'),
  runReferralsNow: () => ipcRenderer.invoke('desktop:run-referrals-now'),
  verifyReferral: (payload) => ipcRenderer.invoke('desktop:verify-referral', payload),
  saveSettings: (payload) => ipcRenderer.invoke('desktop:save-settings', payload),
  getPicksFeed: () => ipcRenderer.invoke('desktop:get-picks-feed'),
  generateReplacementPreview: (payload) => ipcRenderer.invoke('desktop:generate-replacement-preview', payload),
  savePickReplacement: (payload) => ipcRenderer.invoke('desktop:save-pick-replacement', payload),
  openConfig: () => ipcRenderer.invoke('desktop:open-config'),
  openAutomationFolder: () => ipcRenderer.invoke('desktop:open-automation-folder')
});
