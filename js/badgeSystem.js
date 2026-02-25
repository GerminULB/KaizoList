/**
 * @param {Array} trophies - Array of { key, levelName, rank }
 * @param {HTMLElement} container - The container element.
 * @param {Object} BADGES - The global BADGES data object.
 * @param {string} playerName - If provided, the description becomes personalized.
 */
export function renderBadgeDeck(trophies, container, BADGES, playerName = null) {
    if (!container) return;
    container.innerHTML = '';

    const priorityOrder = Object.keys(BADGES);

    trophies.sort((a, b) => {
        return priorityOrder.indexOf(a.key) - priorityOrder.indexOf(b.key);
    });

    const count = trophies.length;
  const isMobile = window.innerWidth < 600;
    const overlap = isMobile ? -15 : (count > 10 ? -30 : -25);

    trophies.forEach((trophy, index) => {
        const badgeData = BADGES[trophy.key];
        if (!badgeData) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'badge-hitbox';
        
        const img = document.createElement('img');
        img.src = badgeData.icon;
        img.className = badgeData.type === 'special' ? 'badge badge-special' : 'badge';
        
        if (index > 0) {
            wrapper.style.marginLeft = `${overlap}px`;
        }

        wrapper.addEventListener('click', () => {
            openBadgeModal(badgeData, trophy.key, playerName, trophy.levelName);
        });
        
        wrapper.appendChild(img);
        container.appendChild(wrapper);
    });
}


function openBadgeModal(badge, key, playerName, levelName) {
    const modal = document.getElementById('badge-modal');
    if (!modal) return;

    document.getElementById('modal-badge-icon').src = badge.icon;
    document.getElementById('modal-badge-title').innerText = badge.label;

    let desc = "";

    if (playerName) {
        if (key === 'special_top1') {
            desc = `This Badge signifies ${playerName}'s completion of ${levelName}, the Top 1!`;
        } else {
            desc = `This ${badge.label} proudly shows that ${playerName} completed ${levelName}!`;
        }
    } else {
        
        if (badge.type === 'special') {
            const cleanLabel = badge.label.replace(' Badge', '');
            if (key === 'special_top1') {
                desc = `This level is the ultimate Kaizo Top 1.`;
            } else {
                desc = `This level is currently ranked the ${cleanLabel} of the Kaizo List.`;
            }
        } else {

            desc = badge.description;
        }
    }

    document.getElementById('modal-badge-description').innerText = desc;
    modal.classList.remove('hidden');
}


export function handleBadgeSkew(e) {
    const hitboxes = document.querySelectorAll('.badge-hitbox');
    
    hitboxes.forEach(box => {
        const rect = box.getBoundingClientRect();
        const badge = box.querySelector('.badge');
        if (!badge) return;

        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const mouseX = (e.clientX - centerX) / (rect.width / 2);
            const mouseY = (e.clientY - centerY) / (rect.height / 2);
            
            badge.style.transform = `scale(1.2) translateY(-15px) rotateY(${mouseX * 45}deg) rotateX(${-mouseY * 45}deg)`;
            box.style.zIndex = "1000";
        } else {
            badge.style.transform = '';
            box.style.zIndex = box.classList.contains('special-container-check') ? "5" : "1"; 
        }
    });
}
