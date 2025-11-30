import * as CID from 'multiformats/cid';

import { createHelia } from 'helia';
import { createLibp2p } from 'libp2p';

import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { webRTCStar } from "@libp2p/webrtc-star";

import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@libp2p/yamux';
import { identify } from '@libp2p/identify';

import { gossipsub } from '@libp2p/gossipsub';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { multiaddr } from '@multiformats/multiaddr';

import { ping } from '@libp2p/ping'
import { peerIdFromString } from '@libp2p/peer-id';

let helia = null;
const CHAT_TOPIC = 'my-helia-decentralized-chat-v1';
const BOOTSTRAP_NODES = [
    '/ip4/104.131.131.82/tcp/4001/ipfs/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
    '/dnsaddr/bootstrap.libp2p.io/ipfs/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    '/dnsaddr/bootstrap.libp2p.io/ipfs/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',

    // --- 2. Узлы WebRTC-Star (Сигнализация) ---
    '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
    '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
];

const iceServersConfig = {
    ice: {
        iceServers: [
            // --- Надежные STUN-серверы ---
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },

            // --- Публичный TURN-сервер с аутентификацией (Для обхода строгого NAT) ---
            // Используется для ретрансляции трафика, когда прямой WebRTC невозможен.
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:turn.b.stb-tv.ru:3478', // Пример из РФ/СНГ (может быть более доступен)
                username: 'test',
                credential: 'test'
            }
        ]
    }
};

export async function initP2PNode() {
    if (helia) return helia;

    // 1. Создание конфигурации Libp2p
    const libp2p = await createLibp2p({
        transports: [
            webSockets(),
            webRTC(iceServersConfig),
        ],
        // connectionEncryption: [noise()],
        streamMuxers: [yamux()],

        services: {
            pubsub: gossipsub({ allowPublishToZeroPeers: true }),
            dht: kadDHT({
                clientMode: true,
            }),
            identify: identify(),
            ping: ping(),
            relay: circuitRelayTransport({
                discoverRelays: 1, // Активно искать 1 ретранслятор
                reservations: { max: 5 } // Разрешить до 5 резервирований
            }),
        },

        peerDiscovery: [
            bootstrap({
                enabled: true,
                list: BOOTSTRAP_NODES, // Используем list вместо peers
            }),
        ]
    });

    helia = await createHelia({ libp2p });

    const peerId = helia.libp2p.peerId.toString();

    console.log(`P2P-Узел Helia запущен. Ваш ID: ${peerId}`);

    window.helia = helia; // Для отладки в консоли браузера
    return helia;
}

const STAR_SERVER_ADDRESS = '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star';

export function getFullAddress() {
    if (!helia) return null;

    // !!! ИЗМЕНЕНИЕ: Возвращаем ТОЛЬКО Peer ID !!!
    // Это заставит dialPeer() искать адрес этого Peer ID через DHT
    const peerId = helia.libp2p.peerId.toString();

    // Мы возвращаем Peer ID, а не полный Multiaddress.
    // Libp2p dial() сам найдет адрес через DHT.
    return peerId;
}

// --- ФУНКЦИИ ЧАТА (PubSub) ---

/**
 * Подписывает узел на общую тему чата.
 * @param {function} onMessageReceived - Колбэк для обработки входящих сообщений.
 */
export function subscribeToChat(onMessageReceived) {
    if (!helia) {
        throw new Error('Узел Helia не инициализирован.');
    }

    const pubsub = helia.libp2p.services.pubsub;

    // Обработчик входящих сообщений
    const handler = (msg) => {
        try {
            // msg.detail содержит данные и метаданные
            const message = new TextDecoder().decode(msg.detail.data);
            const from = msg.detail.from.toString();

            // Если вы не хотите получать собственные сообщения
            if (from === helia.libp2p.peerId.toString()) return;

            onMessageReceived({ from, message });
        } catch (e) {
            console.error('Ошибка при обработке сообщения:', e);
        }
    };

    pubsub.subscribe(CHAT_TOPIC, handler);
    console.log(`Подписаны на тему: ${CHAT_TOPIC}`);
}

/**
 * Публикует сообщение в общую тему чата.
 * @param {string} text - Текст сообщения.
 */
export async function sendMessage(text) {
    if (!helia) {
        throw new Error('Узел Helia не инициализирован.');
    }

    const pubsub = helia.libp2p.services.pubsub;

    // Кодируем текст в Uint8Array
    const data = new TextEncoder().encode(text);

    // Публикуем в тему
    await pubsub.publish(CHAT_TOPIC, data);
}

/**
 * Останавливает узел. Используется при завершении работы компонента Vue.
 */
export async function stopP2PNode() {
    if (helia) {
        await helia.stop();
        helia = null;
        console.log('Узел Helia остановлен.');
    }
}

export async function dialPeer(peerId) {
    if (!helia) throw new Error('P2P-узел не инициализирован.');

    try {
        // !!! Libp2p сам найдет адрес через DHT !!!
        const connection = await helia.libp2p.dial(peerIdFromString(peerId));

        console.log(`Соединение успешно установлено с Peer ID: ${peerId}`);
        return connection;

    } catch (e) {
        // ...
        throw new Error(`Не удалось установить соединение (DHT failure): ${e.message}`);
    }
}
