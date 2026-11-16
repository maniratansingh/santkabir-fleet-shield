// Shared 3D ambulance marker, extracted from the live board.
export function get3DAmbulanceSvg(isDark, status, isSelected, vColor = '#007AFF', vId = '') {
  const isMoving = status === 'moving' || status === 'returning';
  const uniqueId = (vId || 'amb').replace(/[^a-zA-Z0-9]/g, '_');

  return `
    <svg width="54" height="68" class="w-[52px] h-[66px] max-sm:w-[40px] max-sm:h-[50px] select-none" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Windshield gradient with reflective sky tint -->
        <linearGradient id="ambWindshield_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8"/>
          <stop offset="100%" stop-color="#0284C7"/>
        </linearGradient>
        <!-- Slanted aerodynamic hood gradient -->
        <linearGradient id="ambHood_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="60%" stop-color="#F8FAFC"/>
          <stop offset="100%" stop-color="#CBD5E1"/>
        </linearGradient>
        <!-- Clinical white roof deck gradient -->
        <linearGradient id="ambRoof_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="${isDark ? '#E2E8F0' : '#F1F5F9'}"/>
        </linearGradient>
        <!-- High-intensity forward road illumination beam -->
        <linearGradient id="headlightBeam_${uniqueId}" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.65"/>
          <stop offset="60%" stop-color="#FEF08A" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#FEF08A" stop-opacity="0"/>
        </linearGradient>
        <!-- Soft ambient chassis contact shadow (pure GPU radial gradient - 0ms filter cost) -->
        <radialGradient id="chassisShadow_${uniqueId}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#000000" stop-opacity="${isDark ? '0.65' : '0.4'}"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="${isDark ? '0.25' : '0.12'}"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- 1. Deep 3D Ground Drop Shadow on Asphalt (GPU Radial Gradient) -->
      <ellipse cx="27" cy="42" rx="21" ry="24" fill="url(#chassisShadow_${uniqueId})" />

      <!-- 2. Dual Forward 3D Headlight Beams illuminating road pavement -->
      ${isMoving ? `
        <polygon points="17,17 4,0 21,0 20,17" fill="url(#headlightBeam_${uniqueId})" />
        <polygon points="37,17 33,0 50,0 40,17" fill="url(#headlightBeam_${uniqueId})" />
      ` : ''}

      <!-- 3. Heavy Dark Underbody Chassis & Wheels -->
      <rect x="13" y="16" width="28" height="42" rx="6" fill="#0F172A" />
      <!-- Tires & Wheel Arches -->
      <rect x="10.5" y="21" width="3.5" height="8" rx="1.5" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
      <rect x="40" y="21" width="3.5" height="8" rx="1.5" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
      <rect x="10.5" y="44" width="3.5" height="9" rx="1.5" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
      <rect x="40" y="44" width="3.5" height="9" rx="1.5" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />

      <!-- 4. Front Chrome & Amber Aerodynamic Bumper -->
      <rect x="15" y="15" width="24" height="3.5" rx="1.5" fill="#E2E8F0" stroke="#94A3B8" stroke-width="0.8" />
      <line x1="18" y1="16.5" x2="36" y2="16.5" stroke="#475569" stroke-width="1" stroke-linecap="round" />

      <!-- 5. Dual Chrome Headlamp Clusters -->
      <circle cx="18" cy="17" r="2.4" fill="#FEF08A" stroke="#EAB308" stroke-width="0.9" />
      <circle cx="18" cy="17" r="1.1" fill="#FFFFFF" />
      <circle cx="36" cy="17" r="2.4" fill="#FEF08A" stroke="#EAB308" stroke-width="0.9" />
      <circle cx="36" cy="17" r="1.1" fill="#FFFFFF" />

      <!-- 6. 3D Main Body Shell with Clinical Depth Extrusion -->
      <rect x="14" y="17" width="26" height="38" rx="5.5" fill="url(#ambRoof_${uniqueId})" stroke="#64748B" stroke-width="1.2" />

      <!-- 7. Left & Right 3D Shading Flank Facets -->
      <path d="M14 22 L16.5 24 L16.5 53 L14 52 Z" fill="#CBD5E1" />
      <path d="M40 22 L37.5 24 L37.5 53 L40 52 Z" fill="#94A3B8" />

      <!-- 8. Dynamic Livery Side Accent Stripe (Matching Fleet Color) -->
      <line x1="14.5" y1="36" x2="14.5" y2="50" stroke="${vColor}" stroke-width="1.8" stroke-linecap="round" />
      <line x1="39.5" y1="36" x2="39.5" y2="50" stroke="${vColor}" stroke-width="1.8" stroke-linecap="round" />

      <!-- 9. Aerodynamic Slanted Hood with Center Crease -->
      <path d="M16 17 L38 17 L36 24 L18 24 Z" fill="url(#ambHood_${uniqueId})" stroke="#94A3B8" stroke-width="0.8" />
      <line x1="27" y1="17.5" x2="27" y2="23.5" stroke="#FFFFFF" stroke-width="0.8" opacity="0.8" />

      <!-- 10. 3D Panoramic Windshield Glass with Specular Glare -->
      <path d="M17.5 24 L36.5 24 L35 30 L19 30 Z" fill="url(#ambWindshield_${uniqueId})" stroke="#0284C7" stroke-width="0.8" />
      <line x1="20" y1="25" x2="29" y2="29" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round" opacity="0.85" />

      <!-- 11. Dual Side Mirrors -->
      <rect x="11.5" y="24" width="2.5" height="3.5" rx="1" fill="#0F172A" />
      <rect x="40" y="24" width="2.5" height="3.5" rx="1" fill="#0F172A" />

      <!-- 12. 3D Emergency Roof Light Bar (Flashing Siren Beacon) -->
      <rect x="19" y="29" width="16" height="4.5" rx="2" fill="#0F172A" stroke="#334155" stroke-width="0.5" />
      <!-- Left Red Emergency Beacon -->
      <rect x="19.5" y="29.5" width="7" height="3.5" rx="1.5" fill="#EF4444" />
      <!-- Right Blue Emergency Beacon -->
      <rect x="27.5" y="29.5" width="7" height="3.5" rx="1.5" fill="#3B82F6" />
      ${isMoving ? `
        <circle cx="23" cy="31" r="3.5" fill="#EF4444" opacity="0.4" />
        <circle cx="23" cy="31" r="1.8" fill="#FFFFFF" opacity="0.9" />
        <circle cx="31" cy="31" r="3.5" fill="#3B82F6" opacity="0.4" />
        <circle cx="31" cy="31" r="1.8" fill="#FFFFFF" opacity="0.9" />
      ` : ''}

      <!-- 13. Raised Clinical Patient Compartment Deck -->
      <rect x="17" y="34" width="20" height="18" rx="3.5" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.9" />

      <!-- 14. Sant Kabir Eye Hospital Red Medical Cross (✚) Emblem -->
      <circle cx="27" cy="43" r="7.5" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="0.8" />
      <rect x="25.2" y="38" width="3.6" height="10" rx="0.8" fill="#EF4444" />
      <rect x="22" y="41.2" width="10" height="3.6" rx="0.8" fill="#EF4444" />

      <!-- 15. Rear Diamond Plate Step Bumper & Amber/Red Taillights -->
      <rect x="16" y="54" width="22" height="3.5" rx="1.2" fill="#475569" stroke="#334155" stroke-width="0.7" />
      <circle cx="18" cy="53" r="1.6" fill="#EF4444" />
      <circle cx="36" cy="53" r="1.6" fill="#EF4444" />
      <circle cx="20.5" cy="53" r="1.2" fill="#F59E0B" />
      <circle cx="33.5" cy="53" r="1.2" fill="#F59E0B" />
    </svg>
  `;
}
