/*
 * Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Theme Manager for EdgeFirst WebUI
 * Handles light/dark/auto theme switching with system preference detection
 */
(function() {
    'use strict';

    // Prevent double initialization
    if (window.ThemeManager) {
        return;
    }

    /** @constant {string} Storage key for persisting theme preference */
    const STORAGE_KEY = 'edgefirst-theme';

    /** @constant {string[]} Available theme options */
    const THEMES = ['auto', 'light', 'dark'];

    /**
     * SVG icons for theme toggle button (Heroicons outline style)
     * These are static, trusted SVG strings - safe for innerHTML usage
     * @constant {Object.<string, string>}
     */
    const ICONS = {
        auto: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>',
        light: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>',
        dark: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>'
    };

    /**
     * Aria labels for theme toggle button
     * @constant {Object.<string, string>}
     */
    const ARIA_LABELS = {
        auto: 'Theme: Auto (system preference)',
        light: 'Theme: Light mode',
        dark: 'Theme: Dark mode'
    };

    /**
     * ThemeManager object for controlling application theme
     * @namespace
     */
    const ThemeManager = {
        /** @type {string} Storage key for theme preference */
        STORAGE_KEY,

        /** @type {string[]} Available theme options */
        THEMES,

        /**
         * Initialize theme manager
         * Loads theme from localStorage (defaults to 'auto'), applies it,
         * and updates the toggle icon
         * @returns {string} The current theme
         */
        init() {
            const savedTheme = localStorage.getItem(STORAGE_KEY);
            const theme = THEMES.includes(savedTheme) ? savedTheme : 'auto';
            this.apply(theme);
            this.updateToggleIcon(theme);
            return theme;
        },

        /**
         * Apply a theme to the document
         * Sets data-theme attribute, saves to localStorage, and dispatches themechange event
         * @param {string} theme - The theme to apply ('auto', 'light', or 'dark')
         */
        apply(theme) {
            if (!THEMES.includes(theme)) {
                console.warn(`Invalid theme: ${theme}. Using 'auto'.`);
                theme = 'auto';
            }

            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem(STORAGE_KEY, theme);

            const event = new CustomEvent('themechange', {
                detail: {
                    theme,
                    isDark: this.isDark(theme)
                }
            });
            document.dispatchEvent(event);
        },

        /**
         * Cycle through themes in order: auto -> light -> dark -> auto
         * @returns {string} The new theme after cycling
         */
        cycle() {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'auto';
            const currentIndex = THEMES.indexOf(currentTheme);
            const nextIndex = (currentIndex + 1) % THEMES.length;
            const newTheme = THEMES[nextIndex];

            this.apply(newTheme);
            this.updateToggleIcon(newTheme);

            return newTheme;
        },

        /**
         * Determine if a theme results in dark mode
         * @param {string} theme - The theme to check
         * @returns {boolean} True if the theme is dark or auto with system dark preference
         */
        isDark(theme) {
            if (theme === 'dark') {
                return true;
            }
            if (theme === 'light') {
                return false;
            }
            // For 'auto', check system preference
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        },

        /**
         * Update the toggle button icon based on current theme
         * Sets innerHTML with static trusted SVG content from ICONS constant
         * @param {string} theme - The current theme
         */
        updateToggleIcon(theme) {
            const button = document.getElementById('themeToggleBtn');
            if (!button) {
                return;
            }

            // ICONS contains only static, trusted SVG strings defined in this file
            const icon = ICONS[theme] || ICONS.auto;
            const ariaLabel = ARIA_LABELS[theme] || ARIA_LABELS.auto;

            button.innerHTML = icon;
            button.setAttribute('aria-label', ariaLabel);
            button.setAttribute('title', ariaLabel);
        },

        /**
         * Watch for system color scheme preference changes
         * Re-dispatches themechange event when in auto mode
         */
        watchSystemPreference() {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

            const handleChange = () => {
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'auto';
                if (currentTheme === 'auto') {
                    // Re-dispatch themechange event with updated isDark value
                    const event = new CustomEvent('themechange', {
                        detail: {
                            theme: 'auto',
                            isDark: this.isDark('auto')
                        }
                    });
                    document.dispatchEvent(event);
                }
            };

            // Use addEventListener for modern browsers
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleChange);
            } else {
                // Fallback for older browsers
                mediaQuery.addListener(handleChange);
            }
        }
    };

    // Export to global scope
    window.ThemeManager = ThemeManager;

    // Auto-initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        ThemeManager.init();
        ThemeManager.watchSystemPreference();
    });
})();
