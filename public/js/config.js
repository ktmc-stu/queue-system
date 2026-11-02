/* ===== 全域設定 ===== */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDMBiSM4oGSDE3khRISIxtxDCJJTLaxm0",
  authDomain: "ktmc-queue-system.firebaseapp.com",
  databaseURL: "https://ktmc-queue-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ktmc-queue-system",
  storageBucket: "ktmc-queue-system.firebasestorage.app",
  messagingSenderId: "1098822703041",
  appId: "1:1098822703041:web:c010a95bf5c71c478a0140"
};

window.APP_CONFIG = {
  shopName: '學校排隊叫號',
  notice: '請留意大屏幕叫號',
  counters: 6,                 // 櫃位數量
  paper: 58,                   // 小票紙寬 mm（58 / 80）
  adminPin: '1234',            // 後台 PIN
  session: { pad: 3, startFrom: 'A', letters: 'ABCDEFGH' },  // 時段 A→B→C
  langsOrder: ['yue', 'zh', 'en'],   // 播報順序
  audioBase: 'audio/'          // 預錄語音資料夾
};
