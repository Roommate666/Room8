// Image-Validator + Auto-Crop fuer alle Upload-Stellen.
// Prueft Format, croppt auf das gewuenschte Aspect-Ratio (Center-Crop),
// komprimiert auf max 1MB. Wird vor jedem Upload aufgerufen.

(function () {
    /**
     * Validiert + Croppt Bild auf gewuenschtes Aspect-Ratio.
     * @param {File} file - die hochgeladene Datei
     * @param {Object} opts - { aspect: 'square' | '16:9' | '4:3' | 'free', maxSize: number, maxWidth: number, quality: number }
     * @returns {Promise<Blob>} - der gecroppte/komprimierte Blob, ready zum Upload
     */
    async function validateAndCropImage(file, opts) {
        opts = opts || {};
        var targetAspect = opts.aspect || 'free';
        var maxSize = opts.maxSize || 5 * 1024 * 1024; // 5MB
        var maxWidth = opts.maxWidth || 1920;
        var quality = opts.quality || 0.85;

        // 1. File-Size Pre-Check
        if (file.size > maxSize) {
            throw new Error('Bild zu gross (max ' + Math.round(maxSize / 1024 / 1024) + ' MB)');
        }
        if (!file.type.startsWith('image/')) {
            throw new Error('Datei ist kein Bild');
        }

        // 2. Lade Bild via FileReader + Image
        var img = await loadImage(file);

        // 3. Berechne Crop-Koordinaten
        var srcW = img.width;
        var srcH = img.height;
        var srcRatio = srcW / srcH;
        var targetRatio = aspectToRatio(targetAspect, srcRatio);

        var cropW, cropH, cropX, cropY;
        if (Math.abs(srcRatio - targetRatio) < 0.05 || targetAspect === 'free') {
            // Aspect passt schon (Toleranz 5%) ODER free
            cropW = srcW; cropH = srcH; cropX = 0; cropY = 0;
        } else if (srcRatio > targetRatio) {
            // Quelle zu breit -> seitlich croppen
            cropH = srcH;
            cropW = Math.round(srcH * targetRatio);
            cropX = Math.round((srcW - cropW) / 2);
            cropY = 0;
        } else {
            // Quelle zu hoch -> oben/unten croppen
            cropW = srcW;
            cropH = Math.round(srcW / targetRatio);
            cropX = 0;
            cropY = Math.round((srcH - cropH) / 2);
        }

        // 4. Resize auf maxWidth (proportional)
        var outW = cropW;
        var outH = cropH;
        if (outW > maxWidth) {
            var scale = maxWidth / outW;
            outW = maxWidth;
            outH = Math.round(cropH * scale);
        }

        // 5. Canvas-Crop + Compress
        var canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

        // 6. Als Blob (JPEG fuer kleinere Files, behalte PNG bei Transparenz)
        var outType = (file.type === 'image/png' && hasTransparency(ctx, outW, outH)) ? 'image/png' : 'image/jpeg';
        var outQuality = outType === 'image/jpeg' ? quality : undefined;

        var blob = await new Promise(function (resolve, reject) {
            canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Canvas-Encoding fehlgeschlagen')); }, outType, outQuality);
        });

        return blob;
    }

    function aspectToRatio(name, fallback) {
        switch (name) {
            case 'square': return 1;
            case '16:9': return 16 / 9;
            case '4:3': return 4 / 3;
            case '3:4': return 3 / 4;
            case '1:1': return 1;
            default: return fallback || 1;
        }
    }

    function loadImage(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Bild kann nicht geladen werden')); };
            img.src = url;
        });
    }

    function hasTransparency(ctx, w, h) {
        // Prueft 4 Eckpunkte schnell — gut genug fuer Logos
        try {
            var corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
            for (var i = 0; i < corners.length; i++) {
                var pixel = ctx.getImageData(corners[i][0], corners[i][1], 1, 1).data;
                if (pixel[3] < 250) return true;
            }
        } catch (e) { /* CORS or canvas-tainted */ }
        return false;
    }

    window.Room8ImageValidator = { validateAndCropImage: validateAndCropImage };
})();
