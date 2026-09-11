import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw00g2liL-yCWx-M8os3zI-tj2Ck_G3AxPEUdXOxFlbMiuQPeuiCuxuG_xFd7wwh8m1/exec';

// State management for current survey
let currentPhotoData = null;
let currentGeoLocation = null;

// 1. Khởi tạo Notification Permissions
async function initNotifications() {
    try {
        const permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') {
            await LocalNotifications.requestPermissions();
        }
    } catch (err) {
        console.warn('LocalNotifications not supported or permission denied:', err);
    }
}

// 2. Gửi thông báo cục bộ khi đồng bộ thành công
async function showSyncSuccessNotification(count) {
    try {
        await LocalNotifications.schedule({
            notifications: [
                {
                    title: '🎉 Đồng bộ thành công!',
                    body: `Đã gửi thành công ${count} khảo sát hiện trường lên Google Sheets.`,
                    id: Date.now() % 100000,
                    schedule: { at: new Date(Date.now() + 100) },
                    sound: undefined,
                    attachments: undefined,
                    actionTypeId: '',
                    extra: null
                }
            ]
        });
    } catch (err) {
        console.log('Local Notification fallback:', err);
    }
}

// 3. Xử lý Chụp ảnh bằng Capacitor Camera
async function takePhoto() {
    try {
        const photo = await Camera.getPhoto({
            quality: 70,
            allowEditing: false,
            resultType: CameraResultType.DataUrl,
            source: CameraSource.Camera,
            saveToGallery: false,
            width: 1024,
            height: 1024,
            correctOrientation: true
        });

        if (photo && photo.dataUrl) {
            currentPhotoData = photo.dataUrl;
            showPhotoPreview(photo.dataUrl);
        }
    } catch (error) {
        console.error('Lỗi chụp ảnh:', error);
        if (error.message && !error.message.includes('User cancelled')) {
            alert('Không thể mở camera: ' + (error.message || error));
        }
    }
}

function showPhotoPreview(dataUrl) {
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview');
    if (previewContainer && previewImg) {
        previewImg.src = dataUrl;
        previewContainer.classList.remove('hidden');
    }
}

function removePhoto() {
    currentPhotoData = null;
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview');
    if (previewContainer && previewImg) {
        previewImg.src = '';
        previewContainer.classList.add('hidden');
    }
}

// 4. Xử lý Lấy vị trí GPS bằng Capacitor Geolocation
async function fetchCurrentLocation() {
    const statusText = document.getElementById('geo-status-text');
    const coordsBox = document.getElementById('geo-coords');
    const coordsText = document.getElementById('geo-coords-text');
    const geoStatus = document.querySelector('.geo-status');

    if (statusText) statusText.textContent = 'Đang tìm kiếm vệ tinh GPS...';

    try {
        // Kiểm tra & xin quyền Geolocation
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted') {
            await Geolocation.requestPermissions();
        }

        const position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 5000
        });

        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const acc = Math.round(position.coords.accuracy);

        currentGeoLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            mapsUrl: `https://maps.google.com/?q=${lat},${lng}`
        };

        if (statusText) statusText.textContent = 'Đã lấy tọa độ GPS chính xác';
        if (geoStatus) geoStatus.classList.add('active');
        if (coordsBox && coordsText) {
            coordsText.textContent = `${lat}, ${lng} (±${acc}m)`;
            coordsBox.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Lỗi lấy tọa độ GPS:', error);
        if (statusText) statusText.textContent = 'Không thể lấy GPS (Vui lòng bật Vị trí)';
        if (geoStatus) geoStatus.classList.remove('active');
        alert('Lỗi GPS: ' + (error.message || 'Vui lòng kiểm tra quyền truy cập vị trí và bật GPS.'));
    }
}

// 5. Kiểm tra và cập nhật trạng thái mạng
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

// 6. Quản lý lưu trữ Offline trong LocalStorage
function getPendingData() {
    try {
        return JSON.parse(localStorage.getItem('vku_survey_pending') || '[]');
    } catch (e) {
        return [];
    }
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
    alert('Đang mất mạng hoặc sự cố kết nối! Khảo sát đã được lưu an toàn offline trên thiết bị.');
    resetForm();
    updatePendingCount();
}

function resetForm() {
    document.getElementById('survey-form').reset();
    removePhoto();
    currentGeoLocation = null;
    const coordsBox = document.getElementById('geo-coords');
    const statusText = document.getElementById('geo-status-text');
    const geoStatus = document.querySelector('.geo-status');
    if (coordsBox) coordsBox.classList.add('hidden');
    if (statusText) statusText.textContent = 'Chưa lấy tọa độ';
    if (geoStatus) geoStatus.classList.remove('active');
}

// 7. Gửi dữ liệu qua Google Apps Script
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
        console.error('Lỗi gửi dữ liệu lên Google Sheets:', error);
        return false;
    }
}

// 8. Đồng bộ Dữ liệu Offline
export async function syncData() {
    const pending = getPendingData();
    if (pending.length === 0 || !navigator.onLine) return;

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.textContent = 'Đang đồng bộ...';
        syncBtn.disabled = true;
    }

    const remaining = [];
    let syncedCount = 0;

    for (const item of pending) {
        const success = await sendToGoogleSheets(item);
        if (!success) {
            remaining.push(item);
        } else {
            syncedCount++;
        }
    }

    localStorage.setItem('vku_survey_pending', JSON.stringify(remaining));
    updatePendingCount();

    if (syncBtn) {
        syncBtn.textContent = 'Đồng bộ ngay';
        syncBtn.disabled = false;
    }

    if (syncedCount > 0) {
        await showSyncSuccessNotification(syncedCount);
        if (remaining.length === 0) {
            alert(`✅ Đã đồng bộ thành công tất cả ${syncedCount} khảo sát lên Google Sheets!`);
        } else {
            alert(`Đã đồng bộ ${syncedCount} khảo sát. Còn ${remaining.length} bản ghi chờ đồng bộ.`);
        }
    }
}

// 9. Xử lý Gửi Form
document.getElementById('survey-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-btn');
    const originalContent = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Đang gửi khảo sát...</span>';
    }

    const formData = {
        interviewer: document.getElementById('interviewer').value,
        topic: document.getElementById('topic').value,
        condition: document.getElementById('condition').value,
        notes: document.getElementById('notes').value,
        latitude: currentGeoLocation ? currentGeoLocation.latitude : '',
        longitude: currentGeoLocation ? currentGeoLocation.longitude : '',
        accuracy: currentGeoLocation ? `${Math.round(currentGeoLocation.accuracy)}m` : '',
        location_url: currentGeoLocation ? currentGeoLocation.mapsUrl : '',
        photo: currentPhotoData || '',
        timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    };

    try {
        if (navigator.onLine) {
            const success = await sendToGoogleSheets(formData);
            if (success) {
                alert('✅ Gửi khảo sát hiện trường thành công lên Google Sheets!');
                resetForm();
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

// Event Listeners cho UI Buttons
document.getElementById('btn-camera')?.addEventListener('click', takePhoto);
document.getElementById('btn-remove-photo')?.addEventListener('click', removePhoto);
document.getElementById('btn-get-location')?.addEventListener('click', fetchCurrentLocation);
document.getElementById('sync-btn')?.addEventListener('click', syncData);

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
    initNotifications();
    updateOnlineStatus();
    updatePendingCount();
});