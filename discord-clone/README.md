# Discord Clone — Aşama 1: Veritabanı, Kimlik Doğrulama ve Profil

Pixel Agents'tan bağımsız bir proje; kök `package.json` workspace'lerine dahil değildir.

**Yığın:** Next.js 14 (App Router) · TypeScript · Prisma 5 · PostgreSQL · NextAuth v4 (Credentials + JWT) · Tailwind CSS · Shadcn UI (Radix)

## Kurulum

```bash
cd discord-clone
cp .env.example .env          # DATABASE_URL ve NEXTAUTH_SECRET'ı doldurun
npm install                   # postinstall → prisma generate
npx prisma migrate dev --name init
npm run dev                   # http://localhost:3000
```

## Veritabanı modeli (`prisma/schema.prisma`)

| Model           | Amaç                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `User`          | Hesap + profil (`avatarUrl`, `bio`, `status`, `customStatus`); şifre bcrypt hash |
| `Server`        | Sunucu/lonca; `inviteCode` benzersiz, `ownerId` → User                           |
| `Member`        | User ↔ Server bağlantısı + `role` (ADMIN/MODERATOR/GUEST); `(userId, serverId)` benzersiz |
| `Channel`       | `TEXT` veya `VOICE`, bir Server'a ait                                            |
| `Message`       | Kanal mesajı; `deleted` ile yumuşak silme                                        |
| `Conversation`  | İki kullanıcı arası DM odası; `(userOneId, userTwoId)` sıralı ve benzersiz       |
| `DirectMessage` | Conversation içindeki mesaj                                                     |

İlişki kuralları:

- Bir Server, Member, Channel veya User silinince bağlı kayıtlar `onDelete: Cascade` ile silinir.
- `Conversation` katılımcıları her zaman sıralı saklanır (`src/lib/conversation.ts` → `getOrCreateConversation`), böylece A↔B ve B↔A aynı satıra düşer.
- Mesaj tabloları `(channelId|conversationId, createdAt)` indeksli; Aşama 2'deki cursor sayfalama için.

## API

| Method | Yol                        | Açıklama                                                     |
| ------ | -------------------------- | ------------------------------------------------------------ |
| POST   | `/api/auth/register`       | Kayıt (zod doğrulama, 409 = kullanıcı adı/e-posta alınmış)    |
| *      | `/api/auth/[...nextauth]`  | NextAuth (giriş/çıkış/oturum)                                |
| GET    | `/api/profile`             | Oturumdaki kullanıcının profili                              |
| PATCH  | `/api/profile`             | `username`, `bio`, `status`, `customStatus` (yalnızca değişenler) |
| POST   | `/api/profile/avatar`      | `multipart/form-data` `file` — PNG/JPEG/WEBP/GIF, ≤ 2 MB      |
| DELETE | `/api/profile/avatar`      | Avatarı kaldır                                               |

Tüm API'ler oturumu kendileri kontrol eder ve 401 JSON döner; sayfalar `src/middleware.ts` ile `/login`'e yönlendirilir.

## Notlar

- **Avatar depolama** yerel diske yapılır (`uploads/avatars/`, `public/` dışında, çünkü `next start` build sonrası eklenen `public/` dosyalarını servis etmez) ve `/uploads/avatars/[file]` route'u ile sunulur. Dosya tipi istemcinin MIME iddiasına değil, magic byte'lara bakılarak belirlenir; dosya adını sunucu üretir. Aşama 2'de Uploadthing/Cloudinary'ye geçilecek — yalnızca `src/lib/avatar-storage.ts` ve iki route değişir.
- **Durum:** giriş yapınca `OFFLINE` → `ONLINE` olur (seçilmiş IDLE/DND korunur), çıkışta `OFFLINE`. Gerçek zamanlı varlık (presence) Aşama 2'de Socket.io ile gelecek.
- Kullanıcı adı/avatar JWT'de taşınır; profil kaydından sonra istemci `useSession().update()` çağırır ve sunucu değerleri veritabanından yeniden okur.
