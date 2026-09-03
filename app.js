const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw00g2liL-yCWx-M8os3zI-tj2Ck_G3AxPEUdXOxFlbMiuQPeuiCuxuG_xFd7wwh8m1/exec';

// 2. Đăng ký Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker đã đăng ký.'))
        .catch((err) => console.error('Lỗi Service Worker:', err));
}

// 3. Kiểm tra và cập nhật trạng thái mạng
function updateOnlineStatus() {
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');

    if (!statusBar || !statusText) return;

    if (navigator.onLine) {
        statusText.textContent = 'Online';
        statusBar.className = 'status-badge status-online';
        syncData();
    } else {
        statusText.textContent = 'Offline';
        statusBar.className = 'status-badge status-offline';
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

document.addEventListener('DOMContentLoaded', () => {
    updateOnlineStatus();
    updatePendingCount();
});

// 4. Quản lý lưu trữ Offline trong LocalStorage
function getPendingData() {
    return JSON.parse(localStorage.getItem('vku_survey_pending') || '[]');
}

function updatePendingCount() {
    const count = getPendingData().length;
    const pendingElem = document.getElementById('pending-count');
    if (pendingElem) {
        pendingElem.textContent = count;
    }
}

function saveToLocal(data) {
    const pending = getPendingData();
    pending.push(data);
    localStorage.setItem('vku_survey_pending', JSON.stringify(pending));
    alert('Đang mất mạng hoặc gặp sự cố! Khảo sát đã được lưu tạm offline trên máy.');
    document.getElementById('survey-form').reset();
    updatePendingCount();
}

// 5. Xử lý Gửi Form
document.getElementById('survey-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalContent = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Đang gửi lên Google Sheets...</span>';
    }

    const formData = {
        interviewer: document.getElementById('interviewer').value,
        topic: document.getElementById('topic').value,
        condition: document.getElementById('condition').value,
        notes: document.getElementById('notes').value,
        timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    };

    try {
        if (navigator.onLine) {
            const success = await sendToGoogleSheets(formData);
            if (success) {
                alert('✅ Gửi khảo sát thành công lên Google Sheets!');
                document.getElementById('survey-form').reset();
            } else {
                saveToLocal(formData);
            }
        } else {
            saveToLocal(formData);
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalContent;
        }
    }
});

// 6. Gửi dữ liệu qua Google Apps Script (ĐÃ SỬA LỖI ĐỊNH DẠNG BODY DỮ LIỆU)
async function sendToGoogleSheets(data) {
    try {
        const formData = new URLSearchParams();
        formData.append('data', JSON.stringify(data));

        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });
        return true;
    } catch (error) {
        console.error('Lỗi gửi dữ liệu:', error);
        return false;
    }
}

// 7. Đồng bộ Dữ liệu Offline
async function syncData() {
    const pending = getPendingData();
    if (pending.length === 0 || !navigator.onLine) return;

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.textContent = 'Đang đồng bộ...';
        syncBtn.disabled = true;
    }

    const remaining = [];
    for (const item of pending) {
        const success = await sendToGoogleSheets(item);
        if (!success) {
            remaining.push(item);
        }
    }

    localStorage.setItem('vku_survey_pending', JSON.stringify(remaining));
    updatePendingCount();

    if (syncBtn) {
        syncBtn.textContent = 'Đồng bộ ngay';
        syncBtn.disabled = false;
    }

    if (remaining.length === 0) {
        alert('Tất cả dữ liệu offline đã được đồng bộ lên Google Sheets!');
    }
}