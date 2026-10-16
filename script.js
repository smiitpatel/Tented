/**
 * TENTED️: Private Couple Chat — Core Application Logic
 * Pure Vanilla JavaScript (ES6+) with Supabase Client (ESM)
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// =============================================================================
// 1. STATE MANAGEMENT
// =============================================================================
const state = {
  supabase: null,
  currentUser: null,
  myProfile: null,
  partnerProfile: null,
  messages: new Map(), // messageId -> MessageObject
  savedMessages: new Map(),
  retentionHours: 24,
  realtimeChannel: null,
  presenceTracked: false,
  signedUrlCache: new Map(), // image_path -> { url, expiresAt }
  selectedPhotoFile: null,
  activeFilter: 'all', // 'all' | 'photos' | 'text'
  deletingMessageId: null,
  expirationTickerInterval: null,
  partnerOnline: false,
  isLoadingOlder: false,
  hasOlderMessages: true
};

// =============================================================================
// 2. DOM ELEMENTS
// =============================================================================
const DOM = {
  // Views
  authView: document.getElementById('authView'),
  appView: document.getElementById('appView'),
  
  // Auth Form
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  togglePasswordBtn: document.getElementById('togglePasswordBtn'),
  passwordEyeIcon: document.getElementById('passwordEyeIcon'),
  loginSubmitBtn: document.getElementById('loginSubmitBtn'),
  authAlert: document.getElementById('authAlert'),
  authAlertMsg: document.getElementById('authAlertMsg'),
  
  // Config Modal
  openConfigModalBtn: document.getElementById('openConfigModalBtn'),
  configModal: document.getElementById('configModal'),
  closeConfigModalBtn: document.getElementById('closeConfigModalBtn'),
  configForm: document.getElementById('configForm'),
  cfgSupabaseUrl: document.getElementById('cfgSupabaseUrl'),
  cfgSupabaseKey: document.getElementById('cfgSupabaseKey'),
  
  // App Header
  partnerAvatar: document.getElementById('partnerAvatar'),
  partnerOnlineDot: document.getElementById('partnerOnlineDot'),
  partnerDisplayName: document.getElementById('partnerDisplayName'),
  partnerRoleBadge: document.getElementById('partnerRoleBadge'),
  partnerStatusText: document.getElementById('partnerStatusText'),
  
  // Retention Dropdown
  retentionDropdownBtn: document.getElementById('retentionDropdownBtn'),
  currentRetentionText: document.getElementById('currentRetentionText'),
  retentionMenu: document.getElementById('retentionMenu'),
  retentionOption24: document.getElementById('retentionOption24'),
  retentionOption72: document.getElementById('retentionOption72'),
  
  // Saved Messages Drawer
  openSavedDrawerBtn: document.getElementById('openSavedDrawerBtn'),
  savedCountBadge: document.getElementById('savedCountBadge'),
  savedDrawerOverlay: document.getElementById('savedDrawerOverlay'),
  closeSavedDrawerBtn: document.getElementById('closeSavedDrawerBtn'),
  savedMessagesList: document.getElementById('savedMessagesList'),
  filterTabs: document.querySelectorAll('.filter-tab'),
  
  // Settings Modal
  openSettingsModalBtn: document.getElementById('openSettingsModalBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
  settingsDisplayName: document.getElementById('settingsDisplayName'),
  saveProfileBtn: document.getElementById('saveProfileBtn'),
  emojiSelector: document.getElementById('emojiSelector'),
  currentUserEmail: document.getElementById('currentUserEmail'),
  currentUserRole: document.getElementById('currentUserRole'),
  logoutBtn: document.getElementById('logoutBtn'),
  
  // Lightbox Modal
  photoLightbox: document.getElementById('photoLightbox'),
  lightboxBackdrop: document.getElementById('lightboxBackdrop'),
  lightboxImage: document.getElementById('lightboxImage'),
  lightboxCaption: document.getElementById('lightboxCaption'),
  lightboxSaveBtn: document.getElementById('lightboxSaveBtn'),
  lightboxDownloadBtn: document.getElementById('lightboxDownloadBtn'),
  closeLightboxBtn: document.getElementById('closeLightboxBtn'),
  
  // Confirm Delete Modal
  confirmModal: document.getElementById('confirmModal'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmApproveBtn: document.getElementById('confirmApproveBtn'),
  
  // Chat Feed & Composer
  chatContainer: document.getElementById('chatContainer'),
  chatLoading: document.getElementById('chatLoading'),
  chatEmptyState: document.getElementById('chatEmptyState'),
  loadOlderWrapper: document.getElementById('loadOlderWrapper'),
  loadOlderBtn: document.getElementById('loadOlderBtn'),
  messagesFeed: document.getElementById('messagesFeed'),
  connectionAlert: document.getElementById('connectionAlert'),
  
  // Upload Preview Bar & Composer
  uploadPreviewBar: document.getElementById('uploadPreviewBar'),
  previewImgElement: document.getElementById('previewImgElement'),
  previewFileName: document.getElementById('previewFileName'),
  previewFileSize: document.getElementById('previewFileSize'),
  uploadProgressBarTrack: document.getElementById('uploadProgressBarTrack'),
  uploadProgressFill: document.getElementById('uploadProgressFill'),
  uploadStatusText: document.getElementById('uploadStatusText'),
  cancelUploadBtn: document.getElementById('cancelUploadBtn'),
  photoFileInput: document.getElementById('photoFileInput'),
  attachPhotoBtn: document.getElementById('attachPhotoBtn'),
  composerForm: document.getElementById('composerForm'),
  messageTextInput: document.getElementById('messageTextInput'),
  sendBtn: document.getElementById('sendBtn'),
  
  // Floating Hearts
  floatingHearts: document.getElementById('floatingHearts')
};

// =============================================================================
// 3. INITIALIZATION & CONFIGURATION RESOLUTION
// =============================================================================
async function initializeApp() {
  refreshLucideIcons();
  startFloatingHearts();

  // Resolve Supabase credentials:
  // 1. window.__ENV__ or import.meta.env (if running in bundler/Vercel)
  // 2. localStorage
  const url = getEnvVar('VITE_SUPABASE_URL') || localStorage.getItem('tented_supabase_url');
  const key = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') || localStorage.getItem('tented_supabase_key');

  if (url && key) {
    try {
      setupSupabaseClient(url, key);
      await checkExistingSession();
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      showAuthAlert('Invalid Supabase configuration. Please check your URL and Anon Key.');
    }
  } else {
    // If credentials are not pre-configured, prompt user via config modal on first visit
    DOM.cfgSupabaseUrl.value = url || '';
    DOM.cfgSupabaseKey.value = key || '';
    // Show auth view
    showView('auth');
  }

  setupEventListeners();
}

function getEnvVar(name) {
  // Support Vite import.meta.env
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
      return import.meta.env[name];
    }
  } catch (e) {}

  // Support window.__ENV__
  if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[name]) {
    return window.__ENV__[name];
  }

  return null;
}

function setupSupabaseClient(url, key) {
  state.supabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });
}

// =============================================================================
// 4. AUTHENTICATION & ALLOWLIST ENFORCEMENT
// =============================================================================
async function checkExistingSession() {
  if (!state.supabase) return;

  const { data: { session }, error } = await state.supabase.auth.getSession();
  if (error) {
    console.error('Error fetching session:', error);
    showView('auth');
    return;
  }

  if (session && session.user) {
    await handleUserAuthenticated(session.user);
  } else {
    showView('auth');
  }

  // Auth state change listener
  state.supabase.auth.onAuthStateChange(async (event, currentSession) => {
    if (event === 'SIGNED_IN' && currentSession?.user) {
      await handleUserAuthenticated(currentSession.user);
    } else if (event === 'SIGNED_OUT') {
      handleUserLoggedOut();
    }
  });
}

async function handleUserAuthenticated(user) {
  state.currentUser = user;
  
  // CRITICAL SECURITY REQUIREMENT:
  // Query couple_members allowlist table. If current user is not in the allowlist,
  // deny access immediately, terminate auth session, and display warning.
  try {
    const { data: members, error } = await state.supabase
      .from('couple_members')
      .select('*');

    if (error) {
      console.error('Allowlist verification error:', error);
      await state.supabase.auth.signOut();
      showAuthAlert('Sanctuary Access Denied: Database policy restriction. Please ensure your account is registered in couple_members.');
      showView('auth');
      return;
    }

    if (!members || members.length === 0) {
      await state.supabase.auth.signOut();
      showAuthAlert('Sanctuary Unconfigured: No authorized couple members found. Run the provisioning migration in Supabase.');
      showView('auth');
      return;
    }

    const myProfile = members.find(m => m.user_id === user.id);
    if (!myProfile) {
      await state.supabase.auth.signOut();
      showAuthAlert('Access Denied: This sanctuary is strictly restricted to the two authorized partners.');
      showView('auth');
      return;
    }

    // Current user is authorized!
    state.myProfile = myProfile;
    state.partnerProfile = members.find(m => m.user_id !== user.id) || null;

    updateHeaderProfiles();
    showView('app');

    // Load initial sanctuary state
    await loadChatSettings();
    await loadInitialMessages();
    setupRealtimeSubscription();
    startExpirationTicker();
    triggerStorageGarbageCollection();

  } catch (err) {
    console.error('Error during allowlist verification:', err);
    await state.supabase.auth.signOut();
    showAuthAlert('Authentication verification failed: ' + err.message);
    showView('auth');
  }
}

function handleUserLoggedOut() {
  teardownRealtimeSubscription();
  stopExpirationTicker();
  state.currentUser = null;
  state.myProfile = null;
  state.partnerProfile = null;
  state.messages.clear();
  state.savedMessages.clear();
  state.signedUrlCache.clear();
  DOM.messagesFeed.innerHTML = '';
  showView('auth');
}

function updateHeaderProfiles() {
  if (state.partnerProfile) {
    DOM.partnerAvatar.textContent = state.partnerProfile.avatar_emoji || '👸';
    DOM.partnerDisplayName.textContent = state.partnerProfile.display_name || 'My Love';
    DOM.partnerRoleBadge.textContent = state.partnerProfile.role === 'partner_1' ? 'Partner 1' : 'Partner 2';
  } else {
    DOM.partnerAvatar.textContent = '💖';
    DOM.partnerDisplayName.textContent = 'Awaiting Partner';
    DOM.partnerRoleBadge.textContent = 'Partner';
  }

  // Update Settings Modal
  DOM.currentUserEmail.textContent = `Signed in as: ${state.currentUser.email}`;
  DOM.currentUserRole.textContent = `Role: ${state.myProfile.role} (${state.myProfile.display_name})`;
  DOM.settingsDisplayName.value = state.myProfile.display_name || '';
  
  // Highlight active avatar emoji in settings
  const emojiBtns = DOM.emojiSelector.querySelectorAll('.emoji-btn');
  emojiBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.emoji === state.myProfile.avatar_emoji);
  });
}

// =============================================================================
// 5. CHAT SETTINGS & EXPIRATION POLICY
// =============================================================================
async function loadChatSettings() {
  if (!state.supabase) return;

  const { data, error } = await state.supabase
    .from('chat_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Failed to load chat settings:', error);
    return;
  }

  if (data) {
    applyRetentionHours(data.retention_hours);
  }
}

function applyRetentionHours(hours) {
  state.retentionHours = Number(hours) || 24;
  DOM.currentRetentionText.textContent = `${state.retentionHours} Hours`;

  DOM.retentionOption24.classList.toggle('active', state.retentionHours === 24);
  DOM.retentionOption72.classList.toggle('active', state.retentionHours === 72);

  const check24 = DOM.retentionOption24.querySelector('.item-check');
  const check72 = DOM.retentionOption72.querySelector('.item-check');
  if (check24) check24.style.display = state.retentionHours === 24 ? 'block' : 'none';
  if (check72) check72.style.display = state.retentionHours === 72 ? 'block' : 'none';
}

async function updateRetentionSetting(newHours) {
  if (!state.supabase || state.retentionHours === newHours) return;

  try {
    const { error } = await state.supabase
      .from('chat_settings')
      .update({
        retention_hours: newHours,
        updated_at: new Date().toISOString(),
        updated_by: state.currentUser.id
      })
      .eq('id', 1);

    if (error) throw error;
    applyRetentionHours(newHours);
    DOM.retentionMenu.style.display = 'none';
  } catch (err) {
    alert('Failed to update expiration policy: ' + err.message);
  }
}

// =============================================================================
// 6. MESSAGING & REALTIME SUBSCRIPTION
// =============================================================================
async function loadInitialMessages() {
  if (!state.supabase) return;

  DOM.chatLoading.style.display = 'flex';
  DOM.chatEmptyState.style.display = 'none';

  try {
    // Paginate messages: Load latest 50 messages
    const { data: messages, error } = await state.supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw error;

    state.messages.clear();
    state.savedMessages.clear();

    const now = new Date();
    (messages || []).forEach(msg => {
      // Filter out client-side expired messages (database RLS also filters them)
      if (!msg.is_saved && new Date(msg.expires_at) <= now) {
        return;
      }
      state.messages.set(msg.id, msg);
      if (msg.is_saved) {
        state.savedMessages.set(msg.id, msg);
      }
    });

    renderAllMessages();
    updateSavedCountBadge();
    scrollToBottom(false);

    // Also run server-side expiration cleanup RPC safely
    await state.supabase.rpc('cleanup_expired_messages').catch(err => {
      console.warn('Background cleanup RPC notice:', err.message);
    });

  } catch (err) {
    console.error('Error loading messages:', err);
  } finally {
    DOM.chatLoading.style.display = 'none';
    checkEmptyState();
  }
}

function setupRealtimeSubscription() {
  if (!state.supabase || state.realtimeChannel) return;

  state.realtimeChannel = state.supabase.channel('tented-couple-sanctuary')
    // 1. Messages Changes (INSERT, UPDATE, DELETE)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      handleIncomingMessage(payload.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
      handleUpdatedMessage(payload.new);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
      handleDeletedMessage(payload.old);
    })
    // 2. Chat Settings Changes
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_settings' }, payload => {
      if (payload.new && payload.new.retention_hours) {
        applyRetentionHours(payload.new.retention_hours);
      }
    })
    // 3. Presence Tracking (Online / Offline status)
    .on('presence', { event: 'sync' }, () => {
      handlePresenceSync();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        DOM.connectionAlert.style.display = 'none';
        // Track current user presence
        await state.realtimeChannel.track({
          user_id: state.currentUser.id,
          online_at: new Date().toISOString()
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        DOM.connectionAlert.style.display = 'flex';
      }
    });
}

function teardownRealtimeSubscription() {
  if (state.realtimeChannel && state.supabase) {
    state.supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
}

function handlePresenceSync() {
  if (!state.realtimeChannel) return;
  const presenceState = state.realtimeChannel.presenceState();
  const allPresences = Object.values(presenceState).flat();

  // Check if partner is present
  const isPartnerOnline = allPresences.some(p => p.user_id !== state.currentUser.id);
  state.partnerOnline = isPartnerOnline;

  DOM.partnerOnlineDot.classList.toggle('online', isPartnerOnline);
  DOM.partnerOnlineDot.classList.toggle('offline', !isPartnerOnline);
  DOM.partnerStatusText.textContent = isPartnerOnline ? 'Together now • Realtime Live' : 'Away • Realtime Active';
}

function handleIncomingMessage(newMsg) {
  if (!newMsg || state.messages.has(newMsg.id)) return;

  state.messages.set(newMsg.id, newMsg);
  if (newMsg.is_saved) {
    state.savedMessages.set(newMsg.id, newMsg);
    updateSavedCountBadge();
  }

  appendMessageElement(newMsg);
  checkEmptyState();
  scrollToBottom(true);
}

function handleUpdatedMessage(updatedMsg) {
  if (!updatedMsg) return;

  state.messages.set(updatedMsg.id, updatedMsg);

  if (updatedMsg.is_saved) {
    state.savedMessages.set(updatedMsg.id, updatedMsg);
  } else {
    state.savedMessages.delete(updatedMsg.id);
  }
  updateSavedCountBadge();

  // Re-render single message row
  const existingRow = document.getElementById(`msg-${updatedMsg.id}`);
  if (existingRow) {
    const newElement = createMessageElement(updatedMsg);
    existingRow.replaceWith(newElement);
    refreshLucideIcons();
  }

  // Update in saved drawer if open
  if (DOM.savedDrawerOverlay.style.display !== 'none') {
    renderSavedMessages();
  }
}

function handleDeletedMessage(oldMsg) {
  if (!oldMsg) return;

  state.messages.delete(oldMsg.id);
  state.savedMessages.delete(oldMsg.id);
  updateSavedCountBadge();

  const existingRow = document.getElementById(`msg-${oldMsg.id}`);
  if (existingRow) {
    existingRow.remove();
  }
  checkEmptyState();

  if (DOM.savedDrawerOverlay.style.display !== 'none') {
    renderSavedMessages();
  }
}

// =============================================================================
// 7. MESSAGE RENDERING & FORMATTING
// =============================================================================
function renderAllMessages() {
  DOM.messagesFeed.innerHTML = '';
  const sortedMessages = Array.from(state.messages.values())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  sortedMessages.forEach(msg => {
    const el = createMessageElement(msg);
    DOM.messagesFeed.appendChild(el);
  });

  refreshLucideIcons();
}

function createMessageElement(msg) {
  const isSentByMe = msg.sender_id === state.currentUser.id;
  const row = document.createElement('div');
  row.className = `message-row ${isSentByMe ? 'sent' : 'received'}`;
  row.id = `msg-${msg.id}`;

  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.className = 'message-bubble-wrapper';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  // Photo Attachment
  if (msg.image_path) {
    const photoBox = document.createElement('div');
    photoBox.className = 'message-photo-wrapper';
    
    // Skeleton placeholder while signed URL is fetched
    const skeleton = document.createElement('div');
    skeleton.className = 'photo-skeleton';
    skeleton.innerHTML = '<span class="romantic-spinner" style="width:20px;height:20px;"></span>';
    photoBox.appendChild(skeleton);

    // Resolve private signed URL
    resolvePrivateSignedUrl(msg.image_path).then(url => {
      if (url) {
        skeleton.remove();
        const img = document.createElement('img');
        img.className = 'message-photo';
        img.src = url;
        img.alt = 'Private couple memory';
        img.loading = 'lazy';
        img.onclick = () => openLightbox(url, msg);
        photoBox.appendChild(img);
      }
    });

    bubble.appendChild(photoBox);
  }

  // Text Body
  if (msg.body) {
    const textNode = document.createElement('div');
    textNode.className = 'message-text';
    textNode.textContent = msg.body;
    bubble.appendChild(textNode);
  }

  bubbleWrapper.appendChild(bubble);

  // Footer: Time, Expiration pill, Save button, Delete button
  const footer = document.createElement('div');
  footer.className = 'message-footer';

  // Timestamp
  const timeSpan = document.createElement('span');
  timeSpan.className = 'message-time';
  timeSpan.textContent = formatTime(msg.created_at);
  footer.appendChild(timeSpan);

  // Expiration Indicator
  const expSpan = document.createElement('span');
  expSpan.className = `expiration-badge ${msg.is_saved ? 'saved' : ''}`;
  expSpan.id = `exp-${msg.id}`;
  expSpan.innerHTML = msg.is_saved 
    ? '<i data-lucide="bookmark" class="icon-xs"></i> Saved' 
    : `<i data-lucide="hourglass" class="icon-xs"></i> ${calculateTimeRemaining(msg.expires_at)}`;
  footer.appendChild(expSpan);

  // Save / Bookmark Action Button
  const saveBtn = document.createElement('button');
  saveBtn.className = `msg-action-btn ${msg.is_saved ? 'is-saved' : ''}`;
  saveBtn.title = msg.is_saved ? 'Unsave memory (restarts timer)' : 'Save memory permanently';
  saveBtn.innerHTML = `<i data-lucide="heart" class="icon-xs" ${msg.is_saved ? 'fill="currentColor"' : ''}></i>`;
  saveBtn.onclick = () => toggleSaveMessage(msg.id, msg.is_saved);
  footer.appendChild(saveBtn);

  // Delete Action Button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'msg-action-btn msg-delete-btn';
  deleteBtn.title = 'Delete message';
  deleteBtn.innerHTML = '<i data-lucide="trash-2" class="icon-xs"></i>';
  deleteBtn.onclick = () => promptDeleteMessage(msg.id);
  footer.appendChild(deleteBtn);

  bubbleWrapper.appendChild(footer);
  row.appendChild(bubbleWrapper);
  return row;
}

function appendMessageElement(msg) {
  const el = createMessageElement(msg);
  DOM.messagesFeed.appendChild(el);
  refreshLucideIcons();
}

function checkEmptyState() {
  const hasMessages = state.messages.size > 0;
  DOM.chatEmptyState.style.display = hasMessages ? 'none' : 'flex';
}

function scrollToBottom(smooth = true) {
  DOM.chatContainer.scrollTo({
    top: DOM.chatContainer.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function calculateTimeRemaining(expiresAt) {
  if (!expiresAt) return '';
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) return 'Expired';

  const totalMinutes = Math.floor(remainingMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m left`;
}

// Periodic ticker updating message expiration badges
function startExpirationTicker() {
  stopExpirationTicker();
  state.expirationTickerInterval = setInterval(() => {
    const now = Date.now();
    state.messages.forEach(msg => {
      if (msg.is_saved) return;

      const badge = document.getElementById(`exp-${msg.id}`);
      if (!badge) return;

      const remainingMs = new Date(msg.expires_at).getTime() - now;
      if (remainingMs <= 0) {
        // Expired! Immediately remove from DOM
        state.messages.delete(msg.id);
        const row = document.getElementById(`msg-${msg.id}`);
        if (row) row.remove();
        checkEmptyState();
      } else {
        badge.innerHTML = `<i data-lucide="hourglass" class="icon-xs"></i> ${calculateTimeRemaining(msg.expires_at)}`;
      }
    });
    refreshLucideIcons();
  }, 30000); // Check every 30 seconds
}

function stopExpirationTicker() {
  if (state.expirationTickerInterval) {
    clearInterval(state.expirationTickerInterval);
    state.expirationTickerInterval = null;
  }
}

// =============================================================================
// 8. PRIVATE STORAGE & SIGNED URL MANAGEMENT
// =============================================================================
async function resolvePrivateSignedUrl(imagePath) {
  if (!imagePath || !state.supabase) return null;

  // Check cache first
  const cached = state.signedUrlCache.get(imagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60000) { // 1 minute safety buffer
    return cached.url;
  }

  try {
    // Generate signed URL with 3600 seconds (1 hour) expiration
    const { data, error } = await state.supabase.storage
      .from('couple-photos')
      .createSignedUrl(imagePath, 3600);

    if (error) {
      console.error('Error creating signed URL for photo:', error);
      return null;
    }

    if (data?.signedUrl) {
      state.signedUrlCache.set(imagePath, {
        url: data.signedUrl,
        expiresAt: now + (3500 * 1000)
      });
      return data.signedUrl;
    }
  } catch (err) {
    console.error('Exception resolving signed URL:', err);
  }
  return null;
}

// Reliable garbage collection worker to purge storage photos for deleted/expired messages
async function triggerStorageGarbageCollection() {
  if (!state.supabase) return;

  try {
    const { data: queue, error } = await state.supabase.rpc('get_pending_photo_cleanups');
    if (error || !queue || queue.length === 0) return;

    const pathsToDelete = queue.map(item => item.image_path);
    const idsToMark = queue.map(item => item.id);

    // Delete from Supabase Storage bucket
    const { error: storageErr } = await state.supabase.storage
      .from('couple-photos')
      .remove(pathsToDelete);

    if (!storageErr) {
      await state.supabase.rpc('mark_photos_cleaned', { p_ids: idsToMark });
      console.log(`[Tented Storage Purge] Removed ${pathsToDelete.length} expired photos from vault.`);
    }
  } catch (err) {
    console.warn('[Tented Storage Purge notice]', err.message);
  }
}

// =============================================================================
// 9. PHOTO UPLOADS & MESSAGE COMPOSITION
// =============================================================================
async function handleSendMessage(e) {
  if (e) e.preventDefault();
  if (!state.supabase) return;

  const text = DOM.messageTextInput.value.trim();
  const file = state.selectedPhotoFile;

  if (!text && !file) return;

  DOM.sendBtn.disabled = true;

  try {
    let uploadedImagePath = null;

    // Handle Photo Upload
    if (file) {
      DOM.uploadStatusText.textContent = 'Encrypting & vaulting photo...';
      DOM.uploadProgressBarTrack.style.display = 'block';
      DOM.uploadProgressFill.style.width = '60%';

      const fileExt = file.name.split('.').pop() || 'jpg';
      const randomId = crypto.randomUUID();
      // Bucket storage path format: {sender_id}/{random_uuid}.{ext}
      uploadedImagePath = `${state.currentUser.id}/${randomId}.${fileExt}`;

      const { error: uploadError } = await state.supabase.storage
        .from('couple-photos')
        .upload(uploadedImagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type
        });

      if (uploadError) {
        throw new Error('Photo upload failed: ' + uploadError.message);
      }

      DOM.uploadProgressFill.style.width = '100%';
    }

    // Insert Message into PostgreSQL
    // (Note: sender_id, expires_at, and is_saved are server-side computed & validated by Postgres triggers)
    const { data: insertedMsg, error: insertError } = await state.supabase
      .from('messages')
      .insert({
        sender_id: state.currentUser.id,
        body: text || null,
        image_path: uploadedImagePath
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Reset composer state
    DOM.messageTextInput.value = '';
    DOM.messageTextInput.style.height = 'auto';
    clearSelectedPhoto();
    
    // Optimistic fallback in case realtime event has latency
    if (insertedMsg) {
      handleIncomingMessage(insertedMsg);
    }

  } catch (err) {
    alert('Failed to send message: ' + err.message);
  } finally {
    updateSendButtonState();
  }
}

function handlePhotoSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Validate File Type
  const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validMimes.includes(file.type)) {
    alert('Only JPG, PNG, and WebP photos are supported in our private sanctuary.');
    DOM.photoFileInput.value = '';
    return;
  }

  // Validate Max File Size: 5 MB
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    alert('Photo exceeds the 5 MB limit. Please select a smaller photo.');
    DOM.photoFileInput.value = '';
    return;
  }

  state.selectedPhotoFile = file;

  // Display Preview Bar
  const reader = new FileReader();
  reader.onload = (e) => {
    DOM.previewImgElement.src = e.target.result;
    DOM.previewFileName.textContent = file.name;
    DOM.previewFileSize.textContent = formatBytes(file.size);
    DOM.uploadPreviewBar.style.display = 'flex';
    DOM.uploadStatusText.textContent = 'Ready to send';
    DOM.uploadProgressBarTrack.style.display = 'none';
    DOM.uploadProgressFill.style.width = '0%';
    updateSendButtonState();
  };
  reader.readAsDataURL(file);
}

function clearSelectedPhoto() {
  state.selectedPhotoFile = null;
  DOM.photoFileInput.value = '';
  DOM.uploadPreviewBar.style.display = 'none';
  DOM.previewImgElement.src = '';
  updateSendButtonState();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function updateSendButtonState() {
  const hasText = DOM.messageTextInput.value.trim().length > 0;
  const hasFile = state.selectedPhotoFile !== null;
  DOM.sendBtn.disabled = (!hasText && !hasFile);
}

// =============================================================================
// 10. SAVED MESSAGES (PERSISTENT SHARED SAVE)
// =============================================================================
async function toggleSaveMessage(messageId, currentlySaved) {
  if (!state.supabase) return;

  try {
    if (currentlySaved) {
      // Unsave: Delete from message_saves
      // Triggers recalculate expires_at = now() + (retention_hours) and sets is_saved = false
      const { error } = await state.supabase
        .from('message_saves')
        .delete()
        .eq('message_id', messageId);

      if (error) throw error;
    } else {
      // Save: Insert into message_saves
      // Triggers update messages.is_saved = true, preventing automatic deletion
      const { error } = await state.supabase
        .from('message_saves')
        .insert({
          message_id: messageId,
          saved_by: state.currentUser.id
        });

      if (error) throw error;
    }
  } catch (err) {
    alert('Save state update error: ' + err.message);
  }
}

function updateSavedCountBadge() {
  const count = state.savedMessages.size;
  DOM.savedCountBadge.textContent = count;
  DOM.savedCountBadge.style.display = count > 0 ? 'flex' : 'none';
}

function renderSavedMessages() {
  DOM.savedMessagesList.innerHTML = '';
  const filter = state.activeFilter;

  let savedList = Array.from(state.savedMessages.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (filter === 'photos') {
    savedList = savedList.filter(m => !!m.image_path);
  } else if (filter === 'text') {
    savedList = savedList.filter(m => !m.image_path);
  }

  if (savedList.length === 0) {
    DOM.savedMessagesList.innerHTML = `
      <div style="text-align:center; padding: 40px 10px; color: var(--text-muted);">
        <i data-lucide="bookmark" class="icon-lg" style="margin-bottom:8px; opacity:0.4;"></i>
        <p>No saved ${filter} memories yet.<br>Click the heart icon on any message to protect it forever.</p>
      </div>
    `;
    refreshLucideIcons();
    return;
  }

  savedList.forEach(msg => {
    const card = document.createElement('div');
    card.className = 'saved-card';

    const header = document.createElement('div');
    header.className = 'saved-card-header';
    header.innerHTML = `
      <span>${formatTime(msg.created_at)}</span>
      <span class="text-pink">💖 Saved Forever</span>
    `;
    card.appendChild(header);

    if (msg.image_path) {
      resolvePrivateSignedUrl(msg.image_path).then(url => {
        if (url) {
          const img = document.createElement('img');
          img.className = 'saved-card-photo';
          img.src = url;
          img.alt = 'Saved private photo';
          img.onclick = () => openLightbox(url, msg);
          card.insertBefore(img, card.children[1] || null);
        }
      });
    }

    if (msg.body) {
      const content = document.createElement('div');
      content.className = 'saved-card-content';
      content.textContent = msg.body;
      card.appendChild(content);
    }

    const actions = document.createElement('div');
    actions.className = 'saved-card-actions';

    const unsaveBtn = document.createElement('button');
    unsaveBtn.className = 'btn btn-secondary btn-sm';
    unsaveBtn.innerHTML = '<i data-lucide="heart-off" class="icon-xs"></i> Unsave';
    unsaveBtn.onclick = () => toggleSaveMessage(msg.id, true);
    actions.appendChild(unsaveBtn);

    card.appendChild(actions);
    DOM.savedMessagesList.appendChild(card);
  });

  refreshLucideIcons();
}

// =============================================================================
// 11. MESSAGE DELETION (WITH CONFIRMATION)
// =============================================================================
function promptDeleteMessage(messageId) {
  state.deletingMessageId = messageId;
  DOM.confirmModal.style.display = 'flex';
}

async function confirmDeleteMessage() {
  if (!state.deletingMessageId || !state.supabase) return;

  const msgId = state.deletingMessageId;
  DOM.confirmModal.style.display = 'none';
  state.deletingMessageId = null;

  try {
    const { error } = await state.supabase
      .from('messages')
      .delete()
      .eq('id', msgId);

    if (error) throw error;
    // Realtime channel and storage triggers handle the rest!
  } catch (err) {
    alert('Failed to delete message: ' + err.message);
  }
}

// =============================================================================
// 12. FULLSCREEN PHOTO LIGHTBOX
// =============================================================================
function openLightbox(url, msg) {
  DOM.lightboxImage.src = url;
  DOM.lightboxDownloadBtn.href = url;
  DOM.lightboxCaption.textContent = msg.body ? msg.body.substring(0, 40) : 'Private Couple Photo';
  
  DOM.lightboxSaveBtn.onclick = () => toggleSaveMessage(msg.id, msg.is_saved);
  const heartIcon = DOM.lightboxSaveBtn.querySelector('i');
  if (heartIcon) {
    heartIcon.setAttribute('fill', msg.is_saved ? 'currentColor' : 'none');
  }

  DOM.photoLightbox.style.display = 'flex';
  refreshLucideIcons();
}

function closeLightbox() {
  DOM.photoLightbox.style.display = 'none';
  DOM.lightboxImage.src = '';
}

// =============================================================================
// 13. UI EVENT LISTENERS & HELPERS
// =============================================================================
function setupEventListeners() {
  // Login Form
  DOM.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const email = DOM.loginEmail.value.trim();
    const password = DOM.loginPassword.value;

    if (!email || !password) {
      showAuthAlert('Please enter both email and secret password.');
      return;
    }

    if (!state.supabase) {
      showAuthAlert('Please configure your Supabase Project URL and Anon Key first.');
      DOM.configModal.style.display = 'flex';
      return;
    }

    DOM.loginSubmitBtn.disabled = true;
    DOM.loginSubmitBtn.querySelector('.btn-text').textContent = 'Authenticating...';

    const { data, error } = await state.supabase.auth.signInWithPassword({
      email,
      password
    });

    DOM.loginSubmitBtn.disabled = false;
    DOM.loginSubmitBtn.querySelector('.btn-text').textContent = 'Enter Sanctuary';

    if (error) {
      showAuthAlert(error.message);
    }
  });

  // Password visibility toggle
  DOM.togglePasswordBtn.addEventListener('click', () => {
    const isPassword = DOM.loginPassword.type === 'password';
    DOM.loginPassword.type = isPassword ? 'text' : 'password';
    DOM.passwordEyeIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
    refreshLucideIcons();
  });

  // Config Modal
  DOM.openConfigModalBtn.addEventListener('click', () => {
    DOM.configModal.style.display = 'flex';
  });

  DOM.closeConfigModalBtn.addEventListener('click', () => {
    DOM.configModal.style.display = 'none';
  });

  DOM.configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = DOM.cfgSupabaseUrl.value.trim();
    const key = DOM.cfgSupabaseKey.value.trim();

    if (!url || !key) return;

    localStorage.setItem('tented_supabase_url', url);
    localStorage.setItem('tented_supabase_key', key);
    setupSupabaseClient(url, key);
    DOM.configModal.style.display = 'none';
    hideAuthAlert();
    checkExistingSession();
  });

  // Retention Dropdown
  DOM.retentionDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = DOM.retentionMenu.style.display === 'block';
    DOM.retentionMenu.style.display = isVisible ? 'none' : 'block';
  });

  document.addEventListener('click', (e) => {
    if (!DOM.retentionMenu.contains(e.target) && e.target !== DOM.retentionDropdownBtn) {
      DOM.retentionMenu.style.display = 'none';
    }
  });

  DOM.retentionOption24.addEventListener('click', () => updateRetentionSetting(24));
  DOM.retentionOption72.addEventListener('click', () => updateRetentionSetting(72));

  // Saved Drawer
  DOM.openSavedDrawerBtn.addEventListener('click', () => {
    renderSavedMessages();
    DOM.savedDrawerOverlay.style.display = 'flex';
  });

  DOM.closeSavedDrawerBtn.addEventListener('click', () => {
    DOM.savedDrawerOverlay.style.display = 'none';
  });

  DOM.savedDrawerOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.savedDrawerOverlay) {
      DOM.savedDrawerOverlay.style.display = 'none';
    }
  });

  DOM.filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      DOM.filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeFilter = tab.dataset.filter;
      renderSavedMessages();
    });
  });

  // Settings Modal
  DOM.openSettingsModalBtn.addEventListener('click', () => {
    DOM.settingsModal.style.display = 'flex';
  });

  DOM.closeSettingsModalBtn.addEventListener('click', () => {
    DOM.settingsModal.style.display = 'none';
  });

  DOM.settingsModal.addEventListener('click', (e) => {
    if (e.target === DOM.settingsModal) {
      DOM.settingsModal.style.display = 'none';
    }
  });

  // Profile Update in Settings
  DOM.emojiSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-btn');
    if (!btn) return;
    DOM.emojiSelector.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });

  DOM.saveProfileBtn.addEventListener('click', async () => {
    const newName = DOM.settingsDisplayName.value.trim() || 'My Love';
    const activeEmojiBtn = DOM.emojiSelector.querySelector('.emoji-btn.active');
    const newEmoji = activeEmojiBtn ? activeEmojiBtn.dataset.emoji : '💖';

    if (!state.supabase) return;

    try {
      const { error } = await state.supabase
        .from('couple_members')
        .update({
          display_name: newName,
          avatar_emoji: newEmoji
        })
        .eq('user_id', state.currentUser.id);

      if (error) throw error;
      state.myProfile.display_name = newName;
      state.myProfile.avatar_emoji = newEmoji;
      alert('Profile updated successfully!');
      DOM.settingsModal.style.display = 'none';
    } catch (err) {
      alert('Could not update profile: ' + err.message);
    }
  });

  // Logout
  DOM.logoutBtn.addEventListener('click', async () => {
    if (!state.supabase) return;
    DOM.settingsModal.style.display = 'none';
    await state.supabase.auth.signOut();
  });

  // Photo Lightbox
  DOM.closeLightboxBtn.addEventListener('click', closeLightbox);
  DOM.lightboxBackdrop.addEventListener('click', closeLightbox);

  // Confirm Delete
  DOM.confirmCancelBtn.addEventListener('click', () => {
    DOM.confirmModal.style.display = 'none';
    state.deletingMessageId = null;
  });

  DOM.confirmApproveBtn.addEventListener('click', confirmDeleteMessage);

  // Composer Input & Attachments
  DOM.composerForm.addEventListener('submit', handleSendMessage);
  DOM.attachPhotoBtn.addEventListener('click', () => DOM.photoFileInput.click());
  DOM.photoFileInput.addEventListener('change', handlePhotoSelected);
  DOM.cancelUploadBtn.addEventListener('click', clearSelectedPhoto);

  DOM.messageTextInput.addEventListener('input', () => {
    // Auto resize textarea height
    DOM.messageTextInput.style.height = 'auto';
    DOM.messageTextInput.style.height = `${Math.min(DOM.messageTextInput.scrollHeight, 120)}px`;
    updateSendButtonState();
  });

  DOM.messageTextInput.addEventListener('keydown', (e) => {
    // Submit on Enter without Shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
}

function showView(view) {
  if (view === 'auth') {
    DOM.authView.style.display = 'flex';
    DOM.appView.style.display = 'none';
  } else {
    DOM.authView.style.display = 'none';
    DOM.appView.style.display = 'flex';
  }
}

function showAuthAlert(msg) {
  DOM.authAlertMsg.textContent = msg;
  DOM.authAlert.style.display = 'flex';
}

function hideAuthAlert() {
  DOM.authAlert.style.display = 'none';
}

function refreshLucideIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

// Romantic ambient floating hearts generator
function startFloatingHearts() {
  const container = DOM.floatingHearts;
  if (!container) return;

  const emojis = ['💖', '💕', '💗', '✨', '🌹', '💜'];

  setInterval(() => {
    if (document.hidden) return;
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    heart.style.left = `${Math.random() * 100}vw`;
    heart.style.animationDuration = `${8 + Math.random() * 8}s`;
    heart.style.fontSize = `${14 + Math.random() * 12}px`;
    container.appendChild(heart);

    setTimeout(() => heart.remove(), 16000);
  }, 2400);
}

// Bootstrap Application
document.addEventListener('DOMContentLoaded', initializeApp);
