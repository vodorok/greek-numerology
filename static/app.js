/* =========================================================================
   Greek Numerology UI Script (clean, consolidated)
   - Live filtering with debounce (AJAX partial reload)
   - Sort & pagination via AJAX
   - Per-cell clear buttons (+ Clear All)
   - Filter persistence via localStorage
   - Strict numeric validation & sanitization
   - Exact vs Range (Min/Max) disabling logic
   ========================================================================= */

   (function () {
    "use strict";
  
    // -------------------------
    // Config
    // -------------------------
    const MIN_VAL = 0;
    const MAX_VAL = 999999;
    const DEBOUNCE_MS = 300;
    const FILTER_STORAGE_KEY = "greek_num_filters_v1";
  
    // -------------------------
    // DOM & URL Helpers
    // -------------------------
    function $(sel, root = document) { return root.querySelector(sel); }
    function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
    function getFilterForm() { return $("[data-live-filter]"); }
    function inputByName(name) { const f = getFilterForm(); return f ? f.querySelector(`[name="${CSS.escape(name)}"]`) : null; }
  
    function formToParams(form) {
      const params = new URLSearchParams();
      new FormData(form).forEach((v, k) => {
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          params.append(k, v);
        }
      });
      return params;
    }
  
    function currentUrlWith(newParamsObj = {}) {
      const url = new URL(window.location.href);
      Object.entries(newParamsObj).forEach(([k, v]) => {
        if (v === null || v === undefined || String(v).trim() === "") url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      });
      return url;
    }
  
    function replaceResultsHtml(html) {
      const root = $("#results-root");
      if (root) root.innerHTML = html;
    }
  
    async function loadResultsFromParams(params) {
      const url = new URL(window.location.pathname, window.location.origin);
      url.search = params.toString();
      url.searchParams.set("ajax", "1");
      const res = await fetch(url.toString(), { headers: { "X-Requested-With": "fetch" } });
      if (!res.ok) return;
      const html = await res.text();
      replaceResultsHtml(html);
      // Update address bar without ajax param
      url.searchParams.delete("ajax");
      window.history.replaceState({}, "", url);
    }
  
    // -------------------------
    // Debounce
    // -------------------------
    function debounce(fn, delay) {
      let t;
      const wrapped = (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
      };
      wrapped.flush = (...args) => {
        clearTimeout(t);
        fn(...args);
      };
      return wrapped;
    }
  
    // -------------------------
    // Clear buttons (per field) visibility
    // -------------------------
    function setButtonVisibilityForInput(input) {
      if (!input) return;
      const btn = input.closest(".input-with-clear")
        ? input.closest(".input-with-clear").querySelector(".clear-btn")
        : input.parentElement?.querySelector(`.clear-btn[data-target="${input.name}"]`);
      if (!btn) return;
      const hasValue = String(input.value || "").trim().length > 0;
      btn.classList.toggle("hidden", !hasValue);
    }
  
    function refreshAllClearButtons() {
      const form = getFilterForm();
      if (!form) return;
      $all("input", form).forEach(setButtonVisibilityForInput);
    }
  
    // -------------------------
    // Persistence
    // -------------------------
    function readFiltersFromForm(form) {
      const params = new URLSearchParams();
      new FormData(form).forEach((v, k) => {
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          params.append(k, v);
        }
      });
      return Object.fromEntries(params.entries());
    }
    function writeFiltersToForm(form, data) {
      if (!data) return;
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${CSS.escape(k)}"]`);
        if (el) el.value = v;
      });
    }
    function saveFilters() {
      const form = getFilterForm();
      if (!form) return;
      const data = readFiltersFromForm(form);
      try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(data)); } catch {}
    }
    function loadFilters() {
      try {
        const raw = localStorage.getItem(FILTER_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    }
  
    // -------------------------
    // Validation & Disable logic
    // -------------------------
    function sanitizeNumericInput(el) {
      const raw = String(el.value || "");
      const digits = raw.replace(/[^\d]/g, "");
      if (digits !== raw) el.value = digits;
      if (digits === "") return;
      let n = parseInt(digits, 10);
      if (Number.isNaN(n)) { el.value = ""; return; }
      if (n < MIN_VAL) n = MIN_VAL;
      if (n > MAX_VAL) n = MAX_VAL;
      el.value = String(n);
    }
  
    function getRowInputs(i) {
      const form = getFilterForm();
      return {
        exact: form?.querySelector(`[name="n${i}"]`) || null,
        min:   form?.querySelector(`[name="n${i}_min"]`) || null,
        max:   form?.querySelector(`[name="n${i}_max"]`) || null,
      };
    }
  
    function updateDisablesForRow(i) {
      const { exact, min, max } = getRowInputs(i);
      if (!exact || !min || !max) return;
  
      const hasExact = !!String(exact.value || "").trim();
      const hasRange = !!String(min.value || "").trim() || !!String(max.value || "").trim();
  
      if (hasExact) {
        min.value = ""; max.value = "";
        min.disabled = true; max.disabled = true;
        exact.disabled = false;
        min.removeAttribute("max");
        max.removeAttribute("min");
      } else if (hasRange) {
        exact.value = "";
        exact.disabled = true;
        min.disabled = false; max.disabled = false;
      } else {
        exact.disabled = false; min.disabled = false; max.disabled = false;
        min.removeAttribute("max");
        max.removeAttribute("min");
      }
  
      [exact, min, max].forEach(setButtonVisibilityForInput);
    }
  
    // edited: 'min' | 'max' | null
    function enforceStrictRangeForRow(i, edited) {
      const { min, max, exact } = getRowInputs(i);
      if (!min || !max) return;
  
      updateDisablesForRow(i);
  
      const minVal = min.value === "" ? null : parseInt(min.value, 10);
      const maxVal = max.value === "" ? null : parseInt(max.value, 10);
  
      // Update native constraints
      if (minVal !== null) max.min = String(Math.min(MAX_VAL, minVal + 1));
      else max.removeAttribute("min");
  
      if (maxVal !== null) min.max = String(Math.max(MIN_VAL, maxVal - 1));
      else min.removeAttribute("max");
  
      if (minVal !== null && maxVal !== null) {
        if (maxVal <= minVal) {
          if (edited === "max") {
            max.value = String(Math.min(MAX_VAL, minVal + 1));
          } else if (edited === "min") {
            min.value = String(Math.max(MIN_VAL, maxVal - 1));
          } else {
            max.value = String(Math.min(MAX_VAL, minVal + 1));
          }
        }
      }
  
      [min, max].forEach(setButtonVisibilityForInput);
    }
  
    function showValidationIssues(issues, highlightEls) {
      const box = $("#validation");
      const list = $("#validation-list");
      if (!box || !list) return;
  
      if (issues.length) {
        list.innerHTML = issues.map(s => `<li>${s}</li>`).join("");
        box.classList.add("show");
      } else {
        list.innerHTML = "";
        box.classList.remove("show");
      }
  
      $all(".input-error").forEach(x => x.classList.remove("input-error"));
      highlightEls.forEach(el => el.classList.add("input-error"));
    }
  
    function validateFilters() {
      const form = getFilterForm();
      if (!form) return { ok: true, issues: [], highlight: new Set() };
  
      const issues = [];
      const highlight = new Set();
  
      for (let i = 1; i <= 6; i++) {
        const { exact, min, max } = getRowInputs(i);
        if (!(exact && min && max)) continue;
  
        [exact, min, max].forEach(el => el && sanitizeNumericInput(el));
        updateDisablesForRow(i);
  
        if (!min.disabled && !max.disabled) {
          const minVal = min.value === "" ? null : parseInt(min.value, 10);
          const maxVal = max.value === "" ? null : parseInt(max.value, 10);
          if (minVal !== null && maxVal !== null && maxVal <= minVal) {
            // We'll auto-fix to reduce frustration
            max.value = String(Math.min(MAX_VAL, minVal + 1));
          }
        }
      }
  
      // General range & bounds check
      const inputs = $all('input[name="q"], input[name^="n"], input[name="per_page"]', form);
      inputs.forEach((el) => {
        if (el.type === "number" || (el.name && el.name.startsWith("n"))) {
          const v = String(el.value || "");
          if (v !== "") {
            const n = parseInt(v, 10);
            if (Number.isNaN(n) || n < MIN_VAL || n > MAX_VAL) {
              issues.push(`${el.name} must be between ${MIN_VAL} and ${MAX_VAL}.`);
              highlight.add(el);
            }
          }
        }
      });
  
      showValidationIssues(issues, highlight);
      return { ok: issues.length === 0, issues, highlight };
    }
  
    // -------------------------
    // Debounced live filter (wrapped with validation)
    // -------------------------
    const _debouncedCore = debounce(() => {
      const form = getFilterForm();
      if (!form) return;
      const params = formToParams(form);
  
      // Keep sort/dir if present, reset page
      const cur = new URL(window.location.href);
      ["sort", "dir"].forEach(k => {
        if (cur.searchParams.get(k) && !params.has(k)) params.set(k, cur.searchParams.get(k));
      });
      params.delete("page");
  
      loadResultsFromParams(params);
    }, DEBOUNCE_MS);
  
    function debouncedFilter() {
      const { ok } = validateFilters();
      if (ok) {
        saveFilters();
        _debouncedCore();
      }
    }
    debouncedFilter.flush = function () {
      const { ok } = validateFilters();
      if (ok) {
        saveFilters();
        _debouncedCore.flush();
      }
    };
    // Expose for other handlers
    window.debouncedFilter = debouncedFilter;
  
    // -------------------------
    // Event bindings
    // -------------------------
  
    // Initialize on load
    document.addEventListener("DOMContentLoaded", () => {
      const form = getFilterForm();
      if (!form) return;
  
      // If no query params, restore from localStorage
      const url = new URL(window.location.href);
      const hasAnyQs = Array.from(url.searchParams.keys()).some(k =>
        ["q","per_page","sort","dir","page"].includes(k) || /^n[1-6]/.test(k)
      );
      if (!hasAnyQs) {
        const stored = loadFilters();
        if (stored && Object.keys(stored).length) {
          writeFiltersToForm(form, stored);
        }
      }
  
      // Initial state & validation
      for (let i = 1; i <= 6; i++) updateDisablesForRow(i);
      validateFilters();
      refreshAllClearButtons();
    });
  
    // Block non-digits before they land in inputs
    document.addEventListener("beforeinput", (e) => {
      const form = getFilterForm();
      if (!form || !form.contains(e.target)) return;
      const name = e.target.name || "";
      if (!/^n[1-6](_min|_max)?$/.test(name)) return;
      if (e.inputType === "insertText" && /[^\d]/.test(e.data || "")) {
        e.preventDefault();
      }
    });
  
    // Live input handling
    document.addEventListener("input", (e) => {
      const form = getFilterForm();
      if (!(form && form.contains(e.target))) return;
  
      const name = e.target.name || "";
      // Update clear button for any input
      setButtonVisibilityForInput(e.target);
  
      // Numeric filters
      const m = /^n([1-6])(?:_(min|max))?$/.exec(name);
      if (m) {
        const i = m[1];
        const role = name.endsWith("_min") ? "min" : name.endsWith("_max") ? "max" : null;
        sanitizeNumericInput(e.target);
        enforceStrictRangeForRow(i, role);
        const page = form.querySelector('[name="page"]');
        if (page) page.value = "";
        debouncedFilter();
        return;
      }
  
      // Text q or per_page changes trigger debounce
      if (name === "q" || name === "per_page") {
        const page = form.querySelector('[name="page"]');
        if (page) page.value = "";
        debouncedFilter();
      }
    });
  
    // Pressing Enter in filters triggers immediate refresh
    document.addEventListener("keydown", (e) => {
      const form = getFilterForm();
      if (!form) return;
  
      if (form.contains(e.target) && e.key === "Enter") {
        e.preventDefault();
        debouncedFilter.flush();
      }
  
      // ESC clears the focused input
      if (form.contains(e.target) && e.key === "Escape") {
        const target = e.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          if (target.value && String(target.value).trim() !== "") {
            target.value = "";
            setButtonVisibilityForInput(target);
            saveFilters();
            const name = target.name || "";
            const m = /^n([1-6])(?:_(min|max))?$/.exec(name);
            if (m) {
              const i = m[1];
              updateDisablesForRow(i);
              enforceStrictRangeForRow(i, null);
            }
            const page = form.querySelector('[name="page"]');
            if (page) page.value = "";
            debouncedFilter();
          }
        }
      }
    });
  
    // Clear single field (×) buttons
    document.addEventListener("click", (e) => {
      const clearBtn = e.target.closest(".clear-btn");
      if (clearBtn) {
        e.preventDefault();
        const name = clearBtn.dataset.target;
        const input = inputByName(name);
        if (!input) return;
  
        input.value = "";
        setButtonVisibilityForInput(input);
  
        const m = /^n([1-6])(?:_(min|max))?$/.exec(name);
        if (m) {
          const i = m[1];
          updateDisablesForRow(i);
          enforceStrictRangeForRow(i, null);
        }
  
        const form = getFilterForm();
        if (form) {
          const page = form.querySelector('[name="page"]');
          if (page) page.value = "";
        }
        validateFilters();
        debouncedFilter();
        return;
      }
  
      // --- Reset filters (consolidated) ---
      document.addEventListener("click", (e) => {
        const resetBtn = e.target.closest("#reset-btn");
        if (!resetBtn) return;

        e.preventDefault();
        const form = getFilterForm();
        if (!form) return;

        // 1) Clear all inputs (q, per_page, and every n* field)
        const inputs = form.querySelectorAll('input[name="q"], input[name="per_page"], input[name^="n"]');
        inputs.forEach((el) => {
          el.value = "";
          setButtonVisibilityForInput(el);
        });

        // 2) Drop native constraints and fully re-enable rows
        for (let i = 1; i <= 6; i++) {
          const { min, max } = getRowInputs(i);
          if (min) min.removeAttribute("max");
          if (max) max.removeAttribute("min");
          updateDisablesForRow(i);
          enforceStrictRangeForRow(i, null);
        }

        // 3) Clear saved filters
        try { localStorage.removeItem(FILTER_STORAGE_KEY); } catch {}

        // 4) Reset page & history URL to defaults (no query)
        const page = form.querySelector('[name="page"]');
        if (page) page.value = "";
        const baseUrl = new URL(window.location.pathname, window.location.origin);
        window.history.replaceState({}, "", baseUrl); // strip all query params

        // 5) Hide validation + refresh UI
        const box = document.getElementById("validation");
        const list = document.getElementById("validation-list");
        if (box && list) { list.innerHTML = ""; box.classList.remove("show"); }

        refreshAllClearButtons();

        // 6) Load empty-filter results via AJAX (equivalent to a clean page load)
        const empty = new URLSearchParams(); // no params == defaults on server (sort=word asc, per_page default)
        loadResultsFromParams(empty);
      });
  
      // Sort & pagination links (AJAX)
      const sortLink = e.target.closest("[data-sort-link]");
      const pageLink = e.target.closest("[data-page-link]");
      const a = sortLink || pageLink;
      if (a && a.href) {
        e.preventDefault();
        loadResultsFromParams(new URL(a.href).searchParams);
      }
    });
  
    // Delete row (inline)
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest(".delete-btn");
      if (!btn) return;
      e.preventDefault();
      const id = btn.dataset.id;
      if (!id) return;
      if (!confirm("Delete this word?")) return;
      const res = await fetch(`/delete/${id}`, { method: "POST" });
      if (res.ok) {
        const tr = btn.closest("tr");
        tr && tr.remove();
      } else {
        alert("Failed to delete.");
      }
    });
  
    // Keep clear buttons & storage consistent across navigation
    window.addEventListener("popstate", () => {
      refreshAllClearButtons();
      saveFilters();
    });
  
    // Export CSV mirrors current filters
    document.addEventListener("click", (e) => {
      const exportBtn = e.target.closest("#export-btn");
      if (!exportBtn) return;
      const form = getFilterForm();
      if (!form) return;
      e.preventDefault();
      const params = formToParams(form);
      const cur = new URL(window.location.href);
      ["sort", "dir"].forEach(k => {
        if (cur.searchParams.get(k) && !params.has(k)) params.set(k, cur.searchParams.get(k));
      });
      const url = new URL(exportBtn.href, window.location.origin);
      url.search = params.toString();
      window.location.href = url.toString();
    });
  
  })();