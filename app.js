// =============================================================================
// VKU FIELD SURVEY - LOGIC ỨNG DỤNG KHẢO SÁT HIỆN TRƯỜNG NATIVE CAPACITOR
// =============================================================================

// Nhập các plugin native từ Capacitor
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

// Đường dẫn API Web App của Google Apps Script nhận dữ liệu khảo sát
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw00g2liL-yCWx-M8os3zI-tj2Ck_G3AxPEUdXOxFlbMiuQPeuiCuxuG_xFd7wwh8m1/exec';

// Biến lưu trạng thái ảnh hiện trường và vị trí GPS của lượt khảo sát hiện tại
let currentPhotoData = null;       // Chuỗi dữ liệu ảnh Base64 (DataURL)
let currentGeoLocation = null;     // Đối tượng chứa { latitude, longitude, accuracy, mapsUrl }

// =============================================================================
// 1. KHỞI TẠO VÀ XIN QUYỀN THÔNG BÁO CỤC BỘ (LOCAL NOTIFICATIONS)
// =============================================================================
async function initNotifications() {
    try {
        // Kiểm tra trạng thái cấp quyền thông báo trên thiết bị Android
        const permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') {
            // Yêu cầu người dùng cấp quyền nếu chưa có
            await LocalNotifications.requestPermissions();
        }
    } catch (err) {
        console.warn('Thiết bị không hỗ trợ LocalNotifications hoặc người dùng từ chối quyền:', err);
    }
}

// =============================================================================
// 2. GỬI THÔNG BÁO HỆ THỐNG ANDROID KHI ĐỒNG BỘ DỮ LIỆU THÀNH CÔNG
// =============================================================================
async function showSyncSuccessNotification(count) {
    try {
        // Lên lịch kích hoạt ngay thông báo đẩy trên thanh thông báo của điện thoại
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
        console.log('Không thể phát Local Notification native, fallback sang giao diện:', err);
    }
}

// =============================================================================
// 3. CHỨC NĂNG CHỤP ẢNH HIỆN TRƯỜNG BẰNG CAPACITOR CAMERA PLUGIN
// =============================================================================
async function takePhoto() {
    try {
        // Mở giao diện Camera native của Android
        const photo = await Camera.getPhoto({
            quality: 70,                       // Nén chất lượng 70% để tối ưu dung lượng khi gửi mạng
            allowEditing: false,               // Không cần cắt xén sau khi chụp
            resultType: CameraResultType.DataUrl, // Trả về chuỗi định dạng DataUrl Base64
            source: CameraSource.Camera,       // Mở trực tiếp Camera thiết bị
            saveToGallery: false,              // Không bắt buộc lưu vào thư viện ảnh máy
            width: 1024,                       // Giới hạn chiều rộng tối đa 1024px
            height: 1024,                      // Giới hạn chiều cao tối đa 1024px
            correctOrientation: true           // Tự động xoay ảnh đúng chiều
        });

        // Nếu chụp thành công, lưu lại dữ liệu và hiển thị preview
        if (photo && photo.dataUrl) {
            currentPhotoData = photo.dataUrl;
            showPhotoPreview(photo.dataUrl);
        }
    } catch (error) {
        console.error('Lỗi khi chụp ảnh:', error);
        // Nếu không phải do người dùng tự hủy thì báo lỗi
        if (error.message && !error.message.includes('User cancelled')) {
            alert('Không thể mở camera: ' + (error.message || error));
        }
    }
}

// Hiển thị ảnh chụp xem trước lên giao diện
function showPhotoPreview(dataUrl) {
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview');
    if (previewContainer && previewImg) {
        previewImg.src = dataUrl;
        previewContainer.classList.remove('hidden');
    }
}

// Xóa ảnh đã chụp và ẩn khung xem trước
function removePhoto() {
    currentPhotoData = null;
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview');
    if (previewContainer && previewImg) {
        previewImg.src = '';
        previewContainer.classList.add('hidden');
    }
}

// =============================================================================
// 4. CHỨC NĂNG LẤY TỌA ĐỘ GPS BẰNG CAPACITOR GEOLOCATION PLUGIN
// =============================================================================
async function fetchCurrentLocation() {
    const statusText = document.getElementById('geo-status-text');
    const coordsBox = document.getElementById('geo-coords');
    const coordsText = document.getElementById('geo-coords-text');
    const geoStatus = document.querySelector('.geo-status');

    if (statusText) statusText.textContent = 'Đang tìm kiếm vệ tinh GPS...';

    try {
        // Kiểm tra và yêu cầu cấp quyền vị trí GPS
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted') {
            await Geolocation.requestPermissions();
        }

        // Lấy vị trí hiện tại với độ chính xác cao
        const position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,  // Bật GPS vệ tinh chính xác cao
            timeout: 15000,            // Thời gian chờ tối đa 15 giây
            maximumAge: 5000           // Chấp nhận cache vị trí trong vòng 5 giây
        });

        // Định dạng tọa độ lấy 6 chữ số thập phân
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const acc = Math.round(position.coords.accuracy);

        // Lưu thông tin vị trí vào biến trạng thái
        currentGeoLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            mapsUrl: `https://maps.google.com/?q=${lat},${lng}`
        };

        // Cập nhật lên giao diện người dùng
        if (statusText) statusText.textContent = 'Đã lấy tọa độ GPS chính xác';
        if (geoStatus) geoStatus.classList.add('active');
        if (coordsBox && coordsText) {
            coordsText.textContent = `${lat}, ${lng} (±${acc}m)`;
            coordsBox.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Lỗi khi lấy tọa độ GPS:', error);
        if (statusText) statusText.textContent = 'Không thể lấy GPS (Vui lòng bật Vị trí)';
        if (geoStatus) geoStatus.classList.remove('active');
        alert('Lỗi GPS: ' + (error.message || 'Vui lòng kiểm tra quyền truy cập vị trí và bật GPS trên máy.'));
    }
}

// =============================================================================
// 5. THEO DÕI VÀ CẬP NHẬT TRẠNG THÁI MẠNG (ONLINE / OFFLINE)
// =============================================================================
function updateOnlineStatus() {
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');

    if (!statusBar || !statusText) return;

    if (navigator.onLine) {
        statusText.textContent = 'Online';
        statusBar.className = 'status-badge status-online';
        // Tự động kích hoạt đồng bộ dữ liệu nếu có bản ghi đang chờ
        syncData();
    } else {
        statusText.textContent = 'Offline';
        statusBar.className = 'status-badge status-offline';
    }
}

// Lắng nghe sự kiện thay đổi trạng thái kết nối mạng của trình duyệt / WebView
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// =============================================================================
// 6. QUẢN LÝ LƯU TRỮ DỮ LIỆU OFFLINE TRONG LOCALSTORAGE
// =============================================================================

// Lấy danh sách các khảo sát đang chờ đồng bộ từ bộ nhớ máy
function getPendingData() {
    try {
        return JSON.parse(localStorage.getItem('vku_survey_pending') || '[]');
    } catch (e) {
        return [];
    }
}

// Cập nhật số lượng bản ghi đang chờ đồng bộ lên giao diện
function updatePendingCount() {
    const count = getPendingData().length;
    const pendingElem = document.getElementById('pending-count');
    if (pendingElem) {
        pendingElem.textContent = count;
    }
}

// Lưu khảo sát vào bộ nhớ máy khi đang mất mạng
function saveToLocal(data) {
    const pending = getPendingData();
    pending.push(data);
    localStorage.setItem('vku_survey_pending', JSON.stringify(pending));
    alert('Đang mất mạng hoặc sự cố kết nối! Khảo sát đã được lưu an toàn offline trên thiết bị.');
    resetForm();
    updatePendingCount();
}

// Đặt lại toàn bộ form và các trạng thái ảnh/GPS về mặc định
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

// =============================================================================
// 7. GỬI DỮ LIỆU LÊN GOOGLE APPS SCRIPT / GOOGLE SHEETS
// =============================================================================
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
        console.error('Lỗi khi gửi dữ liệu lên Google Sheets:', error);
        return false;
    }
}

// =============================================================================
// 8. ĐỒNG BỘ DỮ LIỆU OFFLINE LÊN MÁY CHỦ KHI CÓ MẠNG
// =============================================================================
export async function syncData() {
    const pending = getPendingData();
    // Nếu không có bản ghi nào hoặc đang offline thì dừng
    if (pending.length === 0 || !navigator.onLine) return;

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.textContent = 'Đang đồng bộ...';
        syncBtn.disabled = true;
    }

    const remaining = [];
    let syncedCount = 0;

    // Lặp qua từng bản ghi để gửi lên Google Sheets
    for (const item of pending) {
        const success = await sendToGoogleSheets(item);
        if (!success) {
            remaining.push(item); // Nếu lỗi thì giữ lại để thử lại sau
        } else {
            syncedCount++;
        }
    }

    // Cập nhật lại danh sách các bản ghi chưa gửi được
    localStorage.setItem('vku_survey_pending', JSON.stringify(remaining));
    updatePendingCount();

    if (syncBtn) {
        syncBtn.textContent = 'Đồng bộ ngay';
        syncBtn.disabled = false;
    }

    // Nếu đồng bộ thành công ít nhất 1 bản ghi, phát thông báo Android
    if (syncedCount > 0) {
        await showSyncSuccessNotification(syncedCount);
        if (remaining.length === 0) {
            alert(`✅ Đã đồng bộ thành công tất cả ${syncedCount} khảo sát lên Google Sheets!`);
        } else {
            alert(`Đã đồng bộ ${syncedCount} khảo sát. Còn ${remaining.length} bản ghi chờ đồng bộ.`);
        }
    }
}

// =============================================================================
// 9. XỬ LÝ SỰ KIỆN SUBMIT FORM KHẢO SÁT
// =============================================================================
document.getElementById('survey-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-btn');
    const originalContent = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Đang gửi khảo sát...</span>';
    }

    // Đóng gói dữ liệu khảo sát đầy đủ thông tin (form + GPS + ảnh + timestamp)
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
            // Nếu có mạng, thử gửi trực tiếp lên Google Sheets
            const success = await sendToGoogleSheets(formData);
            if (success) {
                alert('✅ Gửi khảo sát hiện trường thành công lên Google Sheets!');
                resetForm();
            } else {
                saveToLocal(formData);
            }
        } else {
            // Nếu mất mạng, lưu ngay vào bộ nhớ máy (Offline mode)
            saveToLocal(formData);
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalContent;
        }
    }
});

// Gán sự kiện cho các nút bấm trên giao diện
document.getElementById('btn-camera')?.addEventListener('click', takePhoto);
document.getElementById('btn-remove-photo')?.addEventListener('click', removePhoto);
document.getElementById('btn-get-location')?.addEventListener('click', fetchCurrentLocation);
document.getElementById('sync-btn')?.addEventListener('click', syncData);

// Khởi chạy khi tài liệu HTML tải xong
document.addEventListener('DOMContentLoaded', () => {
    initNotifications();     // Khởi tạo quyền thông báo
    updateOnlineStatus();    // Kiểm tra trạng thái mạng ban đầu
    updatePendingCount();    // Hiển thị số lượng bản ghi offline đang lưu
});