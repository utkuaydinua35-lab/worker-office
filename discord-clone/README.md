# Discord Clone

Pixel Agents'tan bağımsız bir proje; kök `package.json` workspace'lerine dahil değildir.

**Yığın:** Next.js 14 (App Router) · TypeScript · Prisma 5 · PostgreSQL · NextAuth v4 (Credentials + JWT) · Socket.io 4 · LiveKit (SFU) · Tailwind CSS · Shadcn UI (Radix) · emoji-mart

| Aşama | Kapsam                                                                | Durum |
| ----- | --------------------------------------------------------------------- | ----- |
| 1     | Veritabanı şeması, kayıt/giriş, profil ve avatar                       | ✅    |
| 2     | Sunucu/kanal yönetimi, davet, gerçek zamanlı mesajlaşma, dosya, emoji | ✅    |
| 3     | Ses/görüntü odaları, ekran paylaşımı, kullanıcı ses ayarları (LiveKit) | ✅    |
| 4     | Discord yerleşimi, üye listesi, profil kartı, context menu            | —     |
| 5     | Müzik botu                                                            | —     |

## Kurulum

```bash
cd discord-clone
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

`.env` içinde `DATABASE_URL` ve `NEXTAUTH_SECRET` doldurulmalı (`openssl rand -base64 32`). Ardından http://localhost:3000 adresini açın.

Ses kanalları için bir LiveKit sunucusu gerekir (yoksa metin tarafı yine çalışır, ses kanalında uyarı görünür):

- **Yerel:** `brew install livekit` → `livekit-server --dev`. `.env.example`'daki varsayılanlar (`ws://localhost:7880`, `devkey` / `secret`) bununla eşleşir.
- **LiveKit Cloud:** https://cloud.livekit.io'da proje açın; proje URL'sini `NEXT_PUBLIC_LIVEKIT_URL`'e, API anahtar çiftini `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`'a yazın.

> **`npm run dev` kullanın, `next dev` değil.** Socket.io sunucusu `server.ts` içindeki özel HTTP sunucusunda çalışır; `next dev` ile sayfalar açılır ama mesajlar canlı gelmez. Production: `npm run build && npm start`.

## Mimari

```
server.ts                       Next.js + Socket.io aynı HTTP sunucusu / portta
src/lib/socket/
  events.ts                     İstemci ↔ sunucu olay tipleri (paylaşılan)
  server.ts                     Socket.io: oturum çerezinden JWT doğrulama, oda yetkisi, "yazıyor"
  emit.ts                       Route Handler'ların yayın yaptığı yardımcılar
src/app/api/...                 Tüm değişiklikler REST üzerinden (doğrulama + yetki), ardından yayın
```

Mesaj gönderme/düzenleme/silme **REST** ile yapılır; sunucu kaydı yazar, ardından Socket.io ile kanal odasına yayınlar. Böylece doğrulama ve yetki tek yerde kalır, socket yalnızca dağıtım kanalıdır. İstemci aynı mesajı POST cevabından, socket yankısından ve yeniden yüklemeden alabilir; `id` ile birleştirilir.

**Odalar:** `channel:<id>` (mesajlar, yazıyor), `server:<id>` (kanal/ayar/üyelik değişince `server:updated` → sayfa yenilenir), `user:<id>` (sunucudan ayrılınca o kullanıcının socket'leri odalardan çıkarılır). Odaya katılım her seferinde üyelik kontrolünden geçer; yeniden bağlanınca odalara tekrar katılınır ve kaçırılan mesajlar çekilir.

**Socket güvenliği:** Bağlantı NextAuth oturum çerezini çözerek kimlik doğrular. Tarayıcılar çapraz site WebSocket el sıkışmalarına çerez eklediği için farklı `Origin`'den gelen bağlantılar reddedilir.

## Ses ve görüntü (Aşama 3)

```
src/app/api/livekit/token            Üyelik + kanal tipi kontrolü → oda token'ı (identity = userId)
src/app/api/servers/:id/voice-mute   Sunucuda susturma (DB'ye yazar + LiveKit'te anında uygular)
src/components/voice/
  voice-room.tsx                     LiveKitRoom: kanala girince bağlan, çıkınca ayrıl
  voice-stage.tsx                    Katılımcı ızgarası; ekran paylaşımı varsa sahneye alır
  participant-card.tsx               Avatar/kamera, konuşan yeşil halka, mikrofon/susturma ikonları
  participant-menu.tsx               Sağ tık: ses seviyesi %0–200, yerel susturma, sunucuda susturma
  voice-controls.tsx                 Mikrofon, kamera, ekran paylaşımı, bağlantıyı kes
```

- **Ses kanalına tıklamak** odaya bağlar (mikrofon açık, kamera kapalı); başka sayfaya geçmek ya da kırmızı butona basmak ayırır. Aynı hesapla ikinci sekmeden girilirse ilki düşer.
- **Kullanıcı başına ses seviyesi** yalnızca bu cihazda geçerlidir ve `localStorage`'da kişi başına saklanır. %100 üstü için oda `webAudioMix` ile açılır: ses bir Web Audio GainNode'dan geçer (`<audio>` elemanı 1.0'ın üstünü kabul etmez).
- **Yerel susturma** yalnızca senin duyduğunu keser; **sunucuda susturma** LiveKit'in kendisinde o kişinin mikrofon yayın iznini kaldırır, yani istemciye güvenmez. Bayrak `Member.serverMuted`'da durur, token her katılımda ondan üretildiği için çıkıp girmek susturmayı kaldırmaz. Diğer katılımcılar durumu LiveKit participant attribute'larından görür.
- Rol değişikliği, kişi kanala tekrar girene kadar LiveKit attribute'larına yansımaz; yetkiyi yine de sunucu tarafı kontrol eder.

## Yetkiler

| İşlem                                       | GUEST | MODERATOR | ADMIN | Sahip |
| ------------------------------------------- | :---: | :-------: | :---: | :---: |
| Mesaj gönder, kendi mesajını düzenle/sil     |  ✅   |    ✅     |  ✅   |  ✅   |
| Başkasının mesajını sil                      |       |    ✅     |  ✅   |  ✅   |
| Kanal oluştur / düzenle / sil                |       |    ✅     |  ✅   |  ✅   |
| Sunucu adı/simgesi, davet bağlantısını yenile |       |           |  ✅   |  ✅   |
| Sunucuyu sil                                 |       |           |       |  ✅   |
| Sunucudan ayrıl                              |  ✅   |    ✅     |  ✅   |       |
| Sunucuda sustur (yalnızca alt roldekileri)    |       |    ✅     |  ✅   |  ✅   |

Sunucuyu oluşturan kişi ADMIN ve sahip olur; davetle katılanlar GUEST. Rol değiştirme Aşama 4'teki üye menüsüyle gelecek.

## API

| Method | Yol                                    | Açıklama                                               |
| ------ | -------------------------------------- | ------------------------------------------------------ |
| POST   | `/api/auth/register`                   | Kayıt                                                  |
| GET    | `/api/profile` · PATCH                 | Profil okuma / güncelleme                              |
| POST   | `/api/profile/avatar` · DELETE         | Avatar yükleme / kaldırma                              |
| POST   | `/api/servers`                         | Sunucu oluştur (multipart: `name`, `icon?`) + `#genel` |
| PATCH  | `/api/servers/:id` · DELETE            | Ad/simge düzenle · sunucuyu sil                        |
| POST   | `/api/servers/:id/invite-code`         | Davet kodunu yenile                                    |
| POST   | `/api/servers/:id/leave`               | Sunucudan ayrıl                                        |
| POST   | `/api/servers/:id/channels`            | Kanal oluştur `{ name, type }`                         |
| PATCH  | `/api/channels/:id` · DELETE           | Kanalı yeniden adlandır · sil                          |
| GET    | `/api/channels/:id/messages?cursor=`   | En yeniden eskiye 50'lik sayfalar                      |
| POST   | `/api/channels/:id/messages`           | `{ content, fileUrl? }`                                |
| PATCH  | `/api/messages/:id` · DELETE           | Düzenle · sil (yumuşak silme)                          |
| POST   | `/api/invite/:code`                    | Davetle katıl                                          |
| POST   | `/api/uploads`                         | Ek yükle (görsel veya PDF, ≤ 8 MB) → `{ url }`         |
| GET    | `/api/livekit/token?channelId=`        | Ses kanalı token'ı → `{ token, url, serverMuted }`     |
| POST   | `/api/servers/:id/voice-mute`          | `{ userId, muted }` sunucuda susturma                  |

## Dosya depolama (`src/lib/storage.ts`)

- `CLOUDINARY_*` değişkenleri doluysa dosyalar **Cloudinary**'ye, boşsa yerel diskte `uploads/` klasörüne gider (`/uploads/[folder]/[file]` route'u ile sunulur).
- Dosya tipi istemcinin MIME iddiasına değil, magic byte'lara bakılarak belirlenir; dosya adını sunucu üretir.
- Mesaj API'si yalnızca `/api/uploads`'ın ürettiği URL'leri kabul eder; başka sitelerden link (izleme pikseli, `javascript:`) kaydedilemez.
- Mesaj, kanal veya sunucu silinince ekleri de silinir. Yüklenip hiç gönderilmeyen ekler şimdilik temizlenmiyor.
