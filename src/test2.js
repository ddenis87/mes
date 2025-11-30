// --- Протоколы, Транспорты и Сервисы (Импортируем для предотвращения 'fn is not a function') ---
import { createLibp2p } from 'libp2p';

// --- Транспорты ---
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { webRTCStar } from '@libp2p/webrtc-star';

// --- Протоколы и Шифрование ---
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@libp2p/yamux';
import { identify } from '@libp2p/identify';

// --- Сервисы ---
import { kadDHT } from '@libp2p/kad-dht';         // <--- ИСПРАВЛЕНО: Используем ваш рабочий импорт { kadDHT }
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import {ping} from "@libp2p/ping";
import {gossipsub} from "@libp2p/gossipsub";
import {createHelia} from "helia";


let node = null;
const CHAT_TOPIC = 'pigeon-p2p-general-chat-v3';


// --- Конфигурация STUN/TURN (обязательна для WebRTC) ---
const iceServersConfig = {
    ice: {
        ice: {
            iceServers: [
                // Google
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },

                // Mozilla
                { urls: 'stun:stun.services.mozilla.com' },

                // Twilio (часто более стабильный)
                { urls: 'stun:global.stun.twilio.com:3478' },

                // Open Relay Project (TURN, если он работает в вашей сети)
                // TURN-серверы требуют аутентификации, поэтому используем только STUN:
                { urls: 'stun:stun.voipbuster.com' },
                { urls: 'stun:stun.callwithus.com' },
            ]
        }
    }
};

// --- Список Узлов для Входа в Сеть ---
const BOOTSTRAP_NODES = [
    '/ip4/104.131.131.82/tcp/4001/ipfs/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
    '/dnsaddr/bootstrap.libp2p.io/ipfs/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    '/dnsaddr/bootstrap.libp2p.io/ipfs/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    // WSS-узлы для DHT
    '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmbLHAnMoJfTidN6VrBQWsfyqJFo68zQFJ4M8Hk9pGfsnC',
    '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmNnooDu7BBCjMFuhDrSKAHnAHhXseBseZzaxWmy5PyR6E',
    '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmQCU2EcMqAqQPR2i9skXMiK7oahEaQZKqZ8PrXgeFGcLm',
    // WebRTC-Star для сигнализации (обязательно для listen)
    '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
    '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
];


export async function initP2PNode() {
    if (node) return node;

    // --- 1. Создание конфигурации Libp2p ---
    try {
        node = await createLibp2p({
            // 1. АДРЕСА: Слушаем на WebRTC-Star, чтобы другие нас нашли

            // 2. ТРАНСПОРТЫ: WSS и WebRTC
            transports: [
                webSockets(),
                webRTC(iceServersConfig),
                // webRTCStar() // Для адреса LISTEN
            ],

            // 3. ПРОТОКОЛЫ
            // connectionEncryption: [noise()],
            streamMuxers: [yamux()],

            // 4. СЕРВИСЫ
            services: {
                ping: ping(),
                pubsub: gossipsub({ allowPublishToZeroPeers: true }),
                // Мы пока не включаем PubSub/Ping/Relay, чтобы минимизировать точки отказа
                identify: identify(),
                dht: kadDHT({ clientMode: true }),
                relay: circuitRelayTransport({
                    discoverRelays: 1, // Активно искать 1 ретранслятор
                    reservations: { max: 5 } // Разрешить до 5 резервирований
                }),
            },

            // 5. DISCOVERY
            peerDiscovery: [
                bootstrap({ list: BOOTSTRAP_NODES }),
            ]
        });

        node.addEventListener('peer:discovery', (evt) => {
            console.log('found peer: ', evt.detail)
        })

        const peerId = node.peerId.toString();
        console.log(`P2P-Узел Libp2p запущен. Ваш ID: ${peerId}`);
        window.helia = node; // Для отладки в консоли браузера
        return node;

    } catch (e) {
        console.error('Ошибка P2P-инициализации:', e);
        throw e;
    }
}