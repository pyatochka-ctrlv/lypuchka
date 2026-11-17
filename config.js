// Необов'язково: пульт на телефоні через Firebase Realtime Database.
// Залиште databaseURL порожнім — тоді працює лише режим двох вкладок
// в одному браузері (BroadcastChannel).
//
// Приклад: "https://my-project-default-rtdb.europe-west1.firebasedatabase.app"
// Правила бази й інструкція — у README.md.
export const FIREBASE = {
  databaseURL: ""
};

// Скільки живе кімната в базі (години).
export const ROOM_TTL_HOURS = 12;
