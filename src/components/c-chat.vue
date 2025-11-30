<template>
    <div class="chat-wrapper">
        <div class="dial-section">
            <h3>Подключение к Собеседнику (Dialing)</h3>
            <input
                type="text"
                v-model="targetAddress"
                placeholder="Введите полный Multiaddress собеседника сюда"
            />

            <button @click="handleDial" :disabled="!isNodeReady">Соединиться</button>

            <p class="status">Статус: {{ connectionStatus }}</p>
        </div>
        <header>
            <h2>Децентрализованный Мессенджер 🕊️</h2>
            <p :class="{ 'ready': isNodeReady, 'error': !isNodeReady && peerId.length > 5 }">
                Статус:
                <span v-if="isNodeReady">Подключено (ID: {{ peerId }})</span>
                <span v-else>{{ peerId }}</span>
            </p>
        </header>

        <div class="message-container">
            <div v-for="(msg, index) in messages" :key="index"
                 :class="['message-bubble', { 'self': msg.isSelf, 'other': !msg.isSelf, 'system': msg.isError }]">
                <span class="sender">{{ msg.sender }}:</span>
                <span class="text">{{ msg.text }}</span>
            </div>
            <div ref="messagesEnd"></div>
        </div>

        <form @submit.prevent="handleSend" class="input-form">
            <input
                type="text"
                v-model="inputText"
                placeholder="Сообщение (P2P-сеть)..."
                :disabled="!isNodeReady"
            />
            <button type="submit" :disabled="!isNodeReady || !inputText.trim()">
                Отправить
            </button>
        </form>
    </div>
</template>

<script setup>
    import { ref, onMounted, onUnmounted, nextTick } from 'vue';
    import {
        initP2PNode,
        subscribeToChat,
        sendMessage,
        stopP2PNode,
        getFullAddress,
        dialPeer,
    } from '../p2pService';

    // --- Состояния Компонента ---
    const messages = ref([]); // Массив для хранения всех сообщений
    const inputText = ref(''); // Текст в поле ввода
    const peerId = ref('Инициализация P2P-узла...'); // Наш Peer ID
    const isNodeReady = ref(false); // Флаг готовности узла
    const messagesEnd = ref(null); // Ссылка на элемент для автоскролла

    const ourFullAddress = ref('');
    const targetAddress = ref(''); // <--- Сюда вводится адрес собеседника
    const connectionStatus = ref('Узел не запущен');

    let heliaNode = null;

    onMounted(async () => {
        try {
            console.log('Инициализация узла...');
            heliaNode = await initP2PNode();

            // Получаем и отображаем наш ID
            peerId.value = getFullAddress();
            ourFullAddress.value = getFullAddress();
            isNodeReady.value = true;

            // // Подписываемся на тему чата
            subscribeToChat((msg) => {
                handleIncomingMessage(msg.from, msg.message);
            });

        } catch (e) {
            console.error('Ошибка P2P-инициализации:', e);
            peerId.value = 'Ошибка: не удалось запустить P2P-узел.';
            isNodeReady.value = false;
            messages.value.push({ text: 'Соединение не установлено. Проверьте консоль.', sender: 'Система', isError: true });
        }
    });

    onUnmounted(async () => {
        // Останавливаем узел при закрытии страницы или переходе на другой компонент
        await stopP2PNode();
    });

    // Добавление входящего или локального сообщения в список
    const handleIncomingMessage = (fromId, text) => {
        const isSelf = fromId === peerId.value;

        messages.value.push({
            text: text,
            // Сокращаем Peer ID для удобного отображения
            sender: isSelf ? 'Я' : fromId.substring(4, 12),
            isSelf: isSelf
        });

        // Автоскролл к последнему сообщению
        scrollToEnd();
    };

    const handleSend = async () => {
        if (inputText.value.trim() && isNodeReady.value) {
            const text = inputText.value.trim();

            // Отображаем свое сообщение сразу
            handleIncomingMessage(peerId.value, text);

            // Отправляем сообщение в P2P-сеть через PubSub
            await sendMessage(text);

            inputText.value = '';
        }
    };

    const scrollToEnd = () => {
        nextTick(() => {
            if (messagesEnd.value) {
                messagesEnd.value.scrollIntoView({ behavior: 'smooth' });
            }
        });
    };

    const handleDial = async () => {
        if (!targetAddress.value) {
            connectionStatus.value = 'Введите адрес собеседника!';
            return;
        }
        connectionStatus.value = 'Попытка соединения...';
        try {
            // !!! ЗДЕСЬ ИСПОЛЬЗУЕТСЯ ВВЕДЕННЫЙ АДРЕС !!!
            const connection = await dialPeer(targetAddress.value);
            connectionStatus.value = `Соединение успешно установлено! Peer ID: ${connection.remotePeer.toString().substring(0, 8)}...`;
        } catch (e) {
            // Ошибка WebRTC, NAT или неверный адрес
            connectionStatus.value = `Ошибка соединения: ${e.message}`;
        }
    }
</script>

<style scoped>
    .chat-wrapper {
        max-width: 600px;
        margin: 20px auto;
        border: 1px solid #ddd;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        height: 80vh; /* Высота чата */
    }

    header {
        padding: 10px;
        background-color: #f4f4f4;
        border-bottom: 1px solid #ddd;
    }
    .ready { color: green; font-weight: bold; }
    .error { color: red; font-weight: bold; }

    .message-container {
        flex-grow: 1; /* Занимает все доступное пространство */
        overflow-y: auto;
        padding: 10px;
        background-color: #f9f9f9;
    }

    .message-bubble {
        padding: 8px 12px;
        border-radius: 18px;
        margin-bottom: 10px;
        max-width: 70%;
        word-wrap: break-word;
    }

    .sender {
        font-weight: bold;
        margin-right: 5px;
        font-size: 0.9em;
    }

    /* Сообщения от нас */
    .self {
        background-color: #dcf8c6;
        margin-left: auto; /* Выравнивание вправо */
        text-align: right;
    }
    .self .sender { color: #075e54; }


    /* Сообщения от других */
    .other {
        background-color: #ffffff;
        margin-right: auto; /* Выравнивание влево */
        border: 1px solid #eee;
    }
    .other .sender { color: #1f2937; }

    /* Системные сообщения */
    .system {
        text-align: center;
        background-color: #ffdddd;
        color: red;
        margin: 5px auto;
    }

    .input-form {
        display: flex;
        padding: 10px;
        border-top: 1px solid #ddd;
    }

    .input-form input {
        flex-grow: 1;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
        margin-right: 10px;
    }

    .input-form button {
        padding: 10px 15px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    .input-form button:disabled {
        background-color: #a0a0a0;
    }
</style>