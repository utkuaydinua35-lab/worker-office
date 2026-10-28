# Discord Clone

Pixel Agents'tan bağımsız bir proje; kök `package.json` workspace'lerine dahil değildir.

**Yığın:** Next.js 15 (App Router, React 19) · TypeScript · Prisma 5 · PostgreSQL · NextAuth v4 (Credentials + JWT) · Socket.io 4 · LiveKit (SFU, `@livekit/rtc-node` bot) · yt-dlp + ffmpeg · Tailwind CSS · Shadcn UI (Radix) · emoji-mart

| Aşama | Kapsam                                                                | Durum |
| ----- | --------------------------------------------------------------------- | ----- |
| 1     | Veritabanı şeması, kayıt/giriş, profil ve avatar                       | ✅    |
| 2     | Sunucu/kanal yönetimi, davet, gerçek zamanlı mesajlaşma, dosya, emoji | ✅    |
| 3     | Ses/görüntü odaları, ekran paylaşımı, kullanıcı ses ayarları (LiveKit) | ✅    |
| 4     | Discord yerleşimi, üye listesi, profil kartı, sağ tık menüsü, DM      | ✅    |
| 5     | Müzik botu (YouTube → LiveKit, metin komutları, canlı çalma paneli)    | ✅    |

## Kurulum

```bash
cd discord-clone
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

`.env` içinde `DATABASE_URL` ve `NEXTAUTH_SECRET` doldurulmalı (`openssl rand -base64 32`). Ardından http://localhost:3000 adresini açın.

**Yayına almak için:** [DEPLOY.md](DEPLOY.md) (Docker Compose + Caddy ile HTTPS, kendi alan adınızda).

Ses kanalları için bir LiveKit sunucusu (**1.13 veya üstü**) gerekir (yoksa metin tarafı yine çalışır, ses kanalında uyarı görünür):

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

**Odalar:** `channel:<id>` ve `conversation:<id>` (mesajlar, yazıyor), `server:<id>` (kanal/ayar/üyelik değişince `server:updated` → sayfa yenilenir; çevrimiçi durumu), `user:<id>` (DM bildirimleri, DM partnerlerinin durumu; sunucudan ayrılınca/atılınca o kullanıcının socket'leri odalardan çıkarılır). Odaya katılım her seferinde üyelik kontrolünden geçer; yeniden bağlanınca odalara tekrar katılınır ve kaçırılan mesajlar çekilir.

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

## Arayüz ve etkileşimler (Aşama 4)

- **Yerleşim:** sol sunucu çubuğu (en üstte DM butonu) → kanal listesi ve altta kullanıcı paneli (mikrofon, kulaklık, ayarlar) → sohbet/ses alanı → sağda üye listesi (geniş ekranlarda).
- **Kalıcı ses bağlantısı:** LiveKit odası `src/components/providers/voice-provider.tsx` içinde, sayfaların üstünde yaşar. Metin kanallarına, başka sunuculara, DM'lere veya ayarlara geçmek bağlantıyı koparmaz; kullanıcı panelindeki "Ses Bağlandı" kutusundan çıkılır.
- **Mikrofon / kulaklık:** Discord mantığı: sağırlaştırma mikrofonu da kapatır, kaldırınca önceki susturma durumuna döner. Sunucu susturması kalkınca kendini susturmamışsan mikrofon kendiliğinden açılır. Tercihler tarayıcıda saklanır.
- **Gerçek çevrimiçi durumu:** Socket.io bağlantısı olmayan kullanıcı çevrimdışı görünür (sekme kapanınca anında); bağlıysa seçtiği durum (Görünmez = çevrimdışı). Değişiklikler sunucu üyelerine ve DM partnerlerine canlı yayınlanır.
- **Üye listesi:** çevrimiçiler role göre (Yöneticiler, Moderatörler, Çevrimiçi), sonra çevrimdışılar. Tıklayınca profil kartı (avatar, durum, hakkımda, üyelik tarihleri, rol, Mesaj Gönder).
- **Sağ tık menüsü:** Profil, Mesaj Gönder, kullanıcı ses seviyesi (%0–200) ve yerel susturma (ses odasındaki kart menüsüyle senkron), yetkiye göre Sunucuda Sustur, Rol ve Sunucudan At.
- **DM:** yalnızca ortak bir sunucuda olduğun kişilere (arkadaş listesi yok). Kanal sohbetiyle aynı bileşenler: canlı mesaj, yazıyor, düzenle/sil, ek, emoji.
- **Ses kanalındakiler:** kanal listesinde her ses kanalının altında kimlerin (botu da) olduğu, mikrofon/susturma durumlarıyla görünür. Bilgi LiveKit sunucu API'sinden okunur (`src/services/voice-presence.ts`; 4 saniyede bir ve biri katılınca/ayrılınca hemen). Aynı kanaldaysan konuşanların halkası da yanar.
- **Kayıt kodu:** `REGISTRATION_CODE` tanımlıysa kayıt yalnızca bu kodu bilenlere açıktır.

## Müzik botu (Aşama 5)

Gereken programlar: `brew install yt-dlp ffmpeg` (YouTube sık değiştiği için yt-dlp'yi güncel tutun: `brew upgrade yt-dlp`).

```
src/bot/                     Yalnızca server.ts yükler; Next paketine girmez (native LiveKit modülü)
  index.ts                   startMusicBot(): bot kullanıcısını hazırlar, hizmeti bridge'e kaydeder
  music-service.ts           Sunucu başına bir oynatıcı; komutlar, yetki, bot mesajları, durum yayını, otomatik ayrılma
  player.ts                  LiveKit'e katılımcı olarak bağlanır; ffmpeg PCM'ini 10 ms'lik karelerle yayınlar
  media.ts                   yt-dlp ile arama/çözümleme, ffmpeg ile 48 kHz stereo PCM
  commands.ts                !komut ayrıştırıcı
src/lib/music/bridge.ts      Route Handler'lar ↔ bot (globalThis; yalnızca tipler)
```

**Ses hattı:** yt-dlp indirir, çıktısı doğrudan ffmpeg'e akar (`yt-dlp -o - | ffmpeg`). YouTube, yt-dlp'nin çözdüğü medya adresini başka bir programın açmasına 403 ile cevap veriyor; indirmeyi yt-dlp'ye bırakmak bunu önler. YouTube için yt-dlp bir JS çalışma ortamı da ister (Homebrew `deno`'yu kendisi kurar).

**Akış:** metin kanalına `!play ...` yazılır → mesaj normal şekilde kaydedilir → mesaj API'si komutu bota iletir → bot, komutu yazanın o an bulunduğu ses kanalını LiveKit'ten öğrenir, oraya `Müzik Botu` olarak katılır ve çalar. Cevaplar bot kullanıcısından normal mesaj olarak gelir (BOT rozetiyle). Çalan şarkı ve sıra `music:state` olayıyla sunucudaki herkese yayınlanır; kanal listesinin altındaki panel ilerleme çubuğu, duraklat/geç/durdur butonları ve sırayı gösterir.

| Komut | Diğer adlar | Ne yapar |
| ----- | ----------- | -------- |
| `!play <YouTube linki veya arama>` | `!p`, `!çal` | Çalar ya da sıraya ekler (sıra en fazla 200) |
| `!play <çalma listesi linki>` | | Listedeki tüm şarkıları sıraya ekler; `watch?v=…&list=…` ise o videodan başlar. Gizli/silinmiş videolar atlanır |
| `!pause` / `!resume` | `!duraklat` / `!devam` | Duraklatır / devam ettirir |
| `!skip` | `!s`, `!geç` | Sıradakine geçer |
| `!stop` | `!dur`, `!leave` | Sırayı temizler, kanaldan ayrılır |
| `!queue` | `!q`, `!sıra` | Sırayı listeler |
| `!help` | `!yardım` | Komutları gösterir |

- `!play` için bir ses kanalında olmak gerekir; bot başka bir kanalda çalıyorsa oraya katılmanız istenir (sunucu başına tek bot, Discord'daki gibi).
- Duraklat/geç/durdur için botla aynı kanalda olmak gerekir; moderatör ve yöneticiler her yerden yönetebilir.
- Bot sıra bitince 2 dakika, kanalda kimse kalmayınca 30 saniye sonra ayrılır. Kanaldakiler LiveKit sunucu API'sinden kontrol edilir (rtc-node'un katılımcı olayları her zaman gelmiyor).
- Botun sesi diğer katılımcılar gibi sağ tıkla kişisel olarak kısılıp açılabilir.
- **Güvenlik:** yt-dlp verilen adresi sunucudan indirir; bu yüzden yalnızca YouTube bağlantıları ve arama kabul edilir (aksi halde iç ağdaki adreslere istek attırılabilirdi). Başka siteler `MUSIC_EXTRA_URL_HOSTS` ile açılabilir. Bot hesabı (`isBot`) giriş yapamaz.

## Yetkiler

| İşlem                                       | GUEST | MODERATOR | ADMIN | Sahip |
| ------------------------------------------- | :---: | :-------: | :---: | :---: |
| Mesaj gönder, kendi mesajını düzenle/sil     |  ✅   |    ✅     |  ✅   |  ✅   |
| Başkasının mesajını sil                      |       |    ✅     |  ✅   |  ✅   |
| Kanal oluştur / düzenle / sil                |       |    ✅     |  ✅   |  ✅   |
| Sunucu adı/simgesi, davet bağlantısını yenile |       |           |  ✅   |  ✅   |
| Sunucuyu sil                                 |       |           |       |  ✅   |
| Sunucudan ayrıl                              |  ✅   |    ✅     |  ✅   |       |
| Sunucuda sustur / at (yalnızca alt roldekileri) |     |    ✅     |  ✅   |  ✅   |
| Rol ver (yalnızca kendi rolünün altını)       |       |           |  ✅   |  ✅   |

Sunucuyu oluşturan kişi ADMIN ve sahip olur; davetle katılanlar GUEST. Roller üye listesindeki sağ tık menüsünden verilir; yalnızca sahip yönetici atayabilir.

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
| PATCH  | `/api/servers/:id/members/:userId` · DELETE | `{ role }` rol değiştir · sunucudan at            |
| POST   | `/api/conversations`                   | `{ userId }` → DM konuşmasını aç `{ id }`              |
| GET    | `/api/conversations/:id/messages` · POST | DM mesajları (kanal mesajlarıyla aynı biçim)         |
| PATCH  | `/api/direct-messages/:id` · DELETE    | DM düzenle · sil (yalnızca yazan)                      |
| GET    | `/api/servers/:id/music` · POST        | Botun durumu · `{ action: pause/resume/skip/stop }`    |

## Dosya depolama (`src/lib/storage.ts`)

- `CLOUDINARY_*` değişkenleri doluysa dosyalar **Cloudinary**'ye, boşsa yerel diskte `uploads/` klasörüne gider (`/uploads/[folder]/[file]` route'u ile sunulur).
- Dosya tipi istemcinin MIME iddiasına değil, magic byte'lara bakılarak belirlenir; dosya adını sunucu üretir.
- Mesaj API'si yalnızca `/api/uploads`'ın ürettiği URL'leri kabul eder; başka sitelerden link (izleme pikseli, `javascript:`) kaydedilemez.
- Mesaj, kanal veya sunucu silinince ekleri de silinir. Yüklenip hiç gönderilmeyen ekler şimdilik temizlenmiyor.
