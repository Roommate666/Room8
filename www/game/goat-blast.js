/*
  Goat Blast — Block-Blast Prototyp (Phaser 3)
  UniGoat Vision-Plan Phase 2, erster spielbarer Slice.
  - 8x8 Feld, 3 Kaese-Bloecke im Tray, antippen -> platzieren.
  - Volle Reihe/Spalte -> loest sich auf -> Punkte -> Goat springt neben dem Feld hoch.
  - Kein Server, kein Zufall-Glueck: reines Skill-Spiel (Basis fuer Daily-Challenge + Preisgeld).
  Design: Kaese-Gold Bloecke, Mint-Akzent (UI), weiches S/W drumherum.
*/

(function () {
  'use strict';

  var GRID = 8;                 // 8x8 Spielfeld
  var COL = {
    cell:   0x0f1113,           // wird per Theme ueberschrieben (siehe readTheme)
    cellBg: 0xf0f2f2,
    line:   0xe6e9eb,
    cheese: 0xf4b740,           // Kaese-Gold Block
    cheeseEdge: 0xd99a1e,
    mint:   0x21d0a1,
    ink:    0x15181c,
    ghostOk: 0x21d0a1,
    ghostNo: 0xe5533c
  };

  // Block-Blast Formen (relative [zeile, spalte]) + Gewicht (kleiner = haeufiger)
  var SHAPES = [
    { c: [[0,0]], w: 3 },
    { c: [[0,0],[0,1]], w: 5 },
    { c: [[0,0],[1,0]], w: 5 },
    { c: [[0,0],[0,1],[0,2]], w: 5 },
    { c: [[0,0],[1,0],[2,0]], w: 5 },
    { c: [[0,0],[0,1],[1,0]], w: 4 },            // kleine Ecke
    { c: [[0,0],[0,1],[1,0],[1,1]], w: 5 },       // 2x2
    { c: [[0,0],[1,0],[2,0],[2,1]], w: 3 },       // L
    { c: [[0,1],[1,1],[2,1],[2,0]], w: 3 },       // J
    { c: [[0,0],[0,1],[0,2],[1,1]], w: 3 },       // T
    { c: [[0,1],[0,2],[1,0],[1,1]], w: 2 },       // S
    { c: [[0,0],[0,1],[1,1],[1,2]], w: 2 },       // Z
    { c: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], w: 1 } // 3x3
  ];

  function weightedBag() {
    var bag = [];
    SHAPES.forEach(function (s) { for (var i = 0; i < s.w; i++) bag.push(s.c); });
    return bag;
  }
  var BAG = weightedBag();

  function readTheme() {
    // liest die CSS-Variablen aus tokens.css, damit das Spiel dem Design-System folgt
    var cs = getComputedStyle(document.documentElement);
    function hex(v) {
      v = (cs.getPropertyValue(v) || '').trim();
      if (!v) return null;
      if (v[0] === '#') return parseInt(v.slice(1).length === 3
        ? v.slice(1).split('').map(function (x) { return x + x; }).join('')
        : v.slice(1), 16);
      return null;
    }
    COL.cellBg = hex('--surface-2') || COL.cellBg;
    COL.line   = hex('--line') || COL.line;
    COL.mint   = hex('--mint') || COL.mint;
    COL.cheese = hex('--gold') || COL.cheese;
    COL.ink    = hex('--ink') || COL.ink;
  }

  var BlastScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BlastScene() { Phaser.Scene.call(this, { key: 'blast' }); },

    preload: function () {
      this.load.image('goat', 'assets/goat.png');
    },

    create: function () {
      readTheme();
      window.__blast = this; // Debug/Test-Hook (harmlos in Prod)
      var W = this.scale.width, H = this.scale.height;

      // Layout: Feld quadratisch, mittig; Tray darunter; Goat rechts (Desktop) bzw. oben.
      this.pad = Math.round(Math.min(W, H) * 0.03);
      var boardMax = Math.min(W - this.pad * 2, H * 0.62);
      this.cell = Math.floor(boardMax / GRID);
      this.board = this.cell * GRID;
      this.boardX = Math.round((W - this.board) / 2);
      this.boardY = Math.round(this.pad * 2.2);

      this.grid = [];            // 0 = leer, 1 = belegt
      for (var r = 0; r < GRID; r++) { this.grid.push(new Array(GRID).fill(0)); }
      this.blocks = [];          // Phaser-Rechtecke pro belegtem Feld
      for (r = 0; r < GRID; r++) { this.blocks.push(new Array(GRID).fill(null)); }

      this.score = 0;
      this.combo = 0;
      this.best = parseInt(localStorage.getItem('goatblast_best') || '0', 10);
      this.selected = -1;        // Index des gewaehlten Tray-Teils
      this.trayPieces = [];      // {coords, container, used}

      this.drawBoardGrid();
      this.drawGoat();
      this.buildHud();
      this.spawnTray();

      // Klick aufs Feld = platzieren
      this.input.on('pointerdown', this.onPointer, this);
      this.input.on('pointermove', this.onHover, this);
      this.ghost = this.add.graphics().setDepth(5);
    },

    // ---------- Rendering ----------
    drawBoardGrid: function () {
      var g = this.add.graphics().setDepth(0);
      // Feld-Grund (eingesenkte Flaeche)
      g.fillStyle(COL.cellBg, 1);
      g.fillRoundedRect(this.boardX - 6, this.boardY - 6, this.board + 12, this.board + 12, 16);
      g.lineStyle(1, COL.line, 1);
      for (var i = 0; i <= GRID; i++) {
        g.beginPath();
        g.moveTo(this.boardX + i * this.cell, this.boardY);
        g.lineTo(this.boardX + i * this.cell, this.boardY + this.board);
        g.moveTo(this.boardX, this.boardY + i * this.cell);
        g.lineTo(this.boardX + this.board, this.boardY + i * this.cell);
        g.strokePath();
      }
    },

    drawGoat: function () {
      // Goat-Maskottchen neben dem Feld (unten rechts, im freien Bereich unter dem Tray),
      // springt bei Line-Clear. Bewusst NICHT ueber Spielfeldzellen.
      var size = Math.min(this.scale.width * 0.32, 160);
      var mini = Math.max(12, Math.floor(this.cell * 0.5));
      var trayBottom = this.boardY + this.board + this.pad * 1.1 + mini * 3.2;
      var gx = this.scale.width - size * 0.5 - this.pad;
      var gy = Math.max(trayBottom + size * 0.9, this.scale.height - this.pad * 1.4);
      this.goat = this.add.image(gx, gy, 'goat').setOrigin(0.5, 1).setDepth(4);
      this.goat.setDisplaySize(size, size);
      this.goatBaseY = gy;
      // dezenter Idle-Atem
      this.tweens.add({ targets: this.goat, y: gy - 4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      // Sprechblase (versteckt)
      this.speech = this.add.text(gx, gy - size - 6, '', {
        fontFamily: 'Space Grotesk, sans-serif', fontSize: Math.round(size * 0.18) + 'px',
        color: '#0c8e6c', fontStyle: 'bold'
      }).setOrigin(0.5, 1).setDepth(6).setAlpha(0);
    },

    goatJump: function (msg) {
      this.tweens.killTweensOf(this.goat);
      var h = this.goat.displayHeight * 0.5;
      this.tweens.add({
        targets: this.goat, y: this.goatBaseY - h, duration: 190, ease: 'Quad.out',
        yoyo: true,
        onComplete: (function () {
          this.tweens.add({ targets: this.goat, y: this.goatBaseY - 4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        }).bind(this)
      });
      this.tweens.add({ targets: this.goat, angle: { from: -6, to: 6 }, duration: 95, yoyo: true, repeat: 2, onComplete: (function(){ this.goat.setAngle(0); }).bind(this) });
      if (msg) {
        this.speech.setText(msg).setAlpha(1).setScale(0.6);
        this.tweens.add({ targets: this.speech, scale: 1, duration: 180, ease: 'Back.out' });
        this.tweens.add({ targets: this.speech, alpha: 0, delay: 700, duration: 300 });
      }
    },

    buildHud: function () {
      var s = Math.round(Math.min(this.scale.width, this.scale.height) * 0.052);
      this.scoreText = this.add.text(this.boardX, this.pad * 0.4, '0', {
        fontFamily: 'Space Grotesk, sans-serif', fontSize: (s * 1.4) + 'px', color: rgb(COL.ink), fontStyle: 'bold'
      }).setDepth(3);
      this.add.text(this.boardX + 2, this.pad * 0.4 + s * 1.5, 'PUNKTE', {
        fontFamily: 'Inter, sans-serif', fontSize: (s * 0.5) + 'px', color: '#767e88', fontStyle: 'bold'
      }).setDepth(3);
      this.bestText = this.add.text(this.boardX + this.board, this.pad * 0.4, 'Best ' + this.best, {
        fontFamily: 'Inter, sans-serif', fontSize: (s * 0.62) + 'px', color: '#767e88', fontStyle: 'bold'
      }).setOrigin(1, 0).setDepth(3);
    },

    // ---------- Tray ----------
    spawnTray: function () {
      this.trayPieces.forEach(function (p) { if (p.container) p.container.destroy(); });
      this.trayPieces = [];
      var slotW = this.board / 3;
      var trayY = this.boardY + this.board + this.pad * 1.1;
      var mini = Math.max(12, Math.floor(this.cell * 0.5));
      for (var i = 0; i < 3; i++) {
        var coords = BAG[(Math.random() * BAG.length) | 0];
        var ccx = this.boardX + slotW * i + slotW / 2, ccy = trayY + mini * 2;
        var cont = this.add.container(ccx, ccy).setDepth(3);
        var dims = shapeDims(coords);
        var ox = -(dims.w * mini) / 2, oy = -(dims.h * mini) / 2;
        coords.forEach(function (rc) {
          cont.add(cheeseBlock(this, ox + rc[1] * mini, oy + rc[0] * mini, mini - 3));
        }, this);
        cont.setSize(dims.w * mini, dims.h * mini);
        // Trefferflaeche manuell (Graphics-Kinder liefern keine getBounds) + Touch-Padding
        var hw = dims.w * mini, hh = dims.h * mini, padHit = 14;
        var hit = new Phaser.Geom.Rectangle(ccx - hw / 2 - padHit, ccy - hh / 2 - padHit, hw + padHit * 2, hh + padHit * 2);
        this.trayPieces.push({ coords: coords, container: cont, used: false, hit: hit });
      }
      this.selected = -1;
      this.refreshTrayHighlight();
      if (this.isGameOver()) this.showGameOver();
    },

    refreshTrayHighlight: function () {
      this.trayPieces.forEach(function (p, i) {
        if (!p.container) return;
        p.container.setScale(i === this.selected ? 1.12 : (p.used ? 0.5 : 1));
        p.container.setAlpha(p.used ? 0.25 : 1);
      }, this);
    },

    // ---------- Eingabe ----------
    onHover: function (pointer) {
      this.ghost.clear();
      if (this.selected < 0) return;
      var cell = this.cellAt(pointer.x, pointer.y);
      if (!cell) return;
      var coords = this.trayPieces[this.selected].coords;
      var ok = this.fits(coords, cell.r, cell.c);
      this.ghost.fillStyle(ok ? COL.ghostOk : COL.ghostNo, 0.35);
      coords.forEach(function (rc) {
        var rr = cell.r + rc[0], cc = cell.c + rc[1];
        if (rr < GRID && cc < GRID) {
          this.ghost.fillRoundedRect(this.boardX + cc * this.cell + 2, this.boardY + rr * this.cell + 2, this.cell - 4, this.cell - 4, 6);
        }
      }, this);
    },

    onPointer: function (pointer) {
      // 1) Tray-Teil antippen?
      for (var i = 0; i < this.trayPieces.length; i++) {
        var p = this.trayPieces[i];
        if (p.used || !p.container) continue;
        if (Phaser.Geom.Rectangle.Contains(p.hit, pointer.x, pointer.y)) {
          this.selected = (this.selected === i) ? -1 : i;
          this.refreshTrayHighlight();
          this.ghost.clear();
          return;
        }
      }
      // 2) sonst aufs Feld platzieren
      if (this.selected < 0) return;
      var cell = this.cellAt(pointer.x, pointer.y);
      if (!cell) return;
      this.place(this.selected, cell.r, cell.c);
    },

    cellAt: function (x, y) {
      var c = Math.floor((x - this.boardX) / this.cell);
      var r = Math.floor((y - this.boardY) / this.cell);
      if (r < 0 || c < 0 || r >= GRID || c >= GRID) return null;
      return { r: r, c: c };
    },

    fits: function (coords, ar, ac) {
      for (var k = 0; k < coords.length; k++) {
        var rr = ar + coords[k][0], cc = ac + coords[k][1];
        if (rr < 0 || cc < 0 || rr >= GRID || cc >= GRID) return false;
        if (this.grid[rr][cc]) return false;
      }
      return true;
    },

    place: function (idx, ar, ac) {
      var coords = this.trayPieces[idx].coords;
      if (!this.fits(coords, ar, ac)) { this.nudgeInvalid(); return; }
      coords.forEach(function (rc) {
        var rr = ar + rc[0], cc = ac + rc[1];
        this.grid[rr][cc] = 1;
        var blk = cheeseBlock(this, this.boardX + cc * this.cell + this.cell / 2, this.boardY + rr * this.cell + this.cell / 2, this.cell - 4);
        blk.setDepth(2);
        blk.setScale(0.2); this.tweens.add({ targets: blk, scale: 1, duration: 140, ease: 'Back.out' });
        this.blocks[rr][cc] = blk;
      }, this);
      this.addScore(coords.length);

      this.trayPieces[idx].used = true;
      if (this.trayPieces[idx].container) this.trayPieces[idx].container.destroy();
      this.trayPieces[idx].container = null;
      this.selected = -1;
      this.ghost.clear();

      this.clearLines();

      if (this.trayPieces.every(function (p) { return p.used; })) {
        this.time.delayedCall(180, this.spawnTray, [], this);
      } else {
        this.refreshTrayHighlight();
        if (this.isGameOver()) this.showGameOver();
      }
    },

    nudgeInvalid: function () {
      this.cameras.main.shake(120, 0.004);
    },

    clearLines: function () {
      var fullRows = [], fullCols = [], r, c;
      for (r = 0; r < GRID; r++) { if (this.grid[r].every(function (v) { return v; })) fullRows.push(r); }
      for (c = 0; c < GRID; c++) {
        var full = true;
        for (r = 0; r < GRID; r++) { if (!this.grid[r][c]) { full = false; break; } }
        if (full) fullCols.push(c);
      }
      var lines = fullRows.length + fullCols.length;
      if (lines === 0) { this.combo = 0; return; }

      var toClear = {};
      fullRows.forEach(function (rr) { for (var cc = 0; cc < GRID; cc++) toClear[rr + ':' + cc] = [rr, cc]; });
      fullCols.forEach(function (cc) { for (var rr = 0; rr < GRID; rr++) toClear[rr + ':' + cc] = [rr, cc]; });

      Object.keys(toClear).forEach(function (key) {
        var rc = toClear[key], rr = rc[0], cc = rc[1];
        this.grid[rr][cc] = 0;
        var blk = this.blocks[rr][cc];
        this.blocks[rr][cc] = null;
        if (blk) {
          this.tweens.add({ targets: blk, scale: 0, alpha: 0, duration: 180, ease: 'Quad.in', onComplete: function () { blk.destroy(); } });
        }
      }, this);

      this.combo++;
      var gained = lines * 10 * this.combo;
      this.addScore(gained);
      var msg = lines >= 2 ? ('COMBO x' + this.combo + '!') : ('+' + gained);
      this.goatJump(msg);
      this.flashLines(fullRows, fullCols);
    },

    flashLines: function (rows, cols) {
      var fx = this.add.graphics().setDepth(1);
      fx.fillStyle(COL.mint, 0.5);
      rows.forEach(function (r) { fx.fillRect(this.boardX, this.boardY + r * this.cell, this.board, this.cell); }, this);
      cols.forEach(function (c) { fx.fillRect(this.boardX + c * this.cell, this.boardY, this.cell, this.board); }, this);
      this.tweens.add({ targets: fx, alpha: 0, duration: 260, onComplete: function () { fx.destroy(); } });
    },

    addScore: function (n) {
      this.score += n;
      this.scoreText.setText(String(this.score));
      this.tweens.add({ targets: this.scoreText, scale: 1.16, duration: 90, yoyo: true });
      if (this.score > this.best) {
        this.best = this.score;
        localStorage.setItem('goatblast_best', String(this.best));
        this.bestText.setText('Best ' + this.best);
      }
    },

    // ---------- Game Over ----------
    isGameOver: function () {
      var remaining = this.trayPieces.filter(function (p) { return !p.used; });
      if (remaining.length === 0) return false;
      for (var i = 0; i < remaining.length; i++) {
        for (var r = 0; r < GRID; r++) {
          for (var c = 0; c < GRID; c++) {
            if (this.fits(remaining[i].coords, r, c)) return false;
          }
        }
      }
      return true;
    },

    showGameOver: function () {
      var W = this.scale.width, H = this.scale.height;
      var ov = this.add.container(0, 0).setDepth(20);
      var bg = this.add.rectangle(0, 0, W, H, 0x15181c, 0.55).setOrigin(0);
      var card = this.add.rectangle(W / 2, H / 2, Math.min(W * 0.82, 360), 220, 0xffffff, 1).setStrokeStyle(1, COL.line);
      card.setOrigin(0.5); if (card.setRadius) { /* noop */ }
      var t1 = this.add.text(W / 2, H / 2 - 62, 'Kein Zug mehr', { fontFamily: 'Space Grotesk, sans-serif', fontSize: '26px', color: '#15181c', fontStyle: 'bold' }).setOrigin(0.5);
      var t2 = this.add.text(W / 2, H / 2 - 20, this.score + ' Punkte', { fontFamily: 'Inter, sans-serif', fontSize: '18px', color: '#3c424a' }).setOrigin(0.5);
      var t3 = this.add.text(W / 2, H / 2 + 8, 'Bestwert ' + this.best, { fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#767e88' }).setOrigin(0.5);
      var btn = this.add.rectangle(W / 2, H / 2 + 58, 180, 50, COL.mint, 1).setOrigin(0.5).setInteractive({ useHandCursor: true });
      var bt = this.add.text(W / 2, H / 2 + 58, 'Nochmal spielen', { fontFamily: 'Space Grotesk, sans-serif', fontSize: '17px', color: '#06392c', fontStyle: 'bold' }).setOrigin(0.5);
      ov.add([bg, card, t1, t2, t3, btn, bt]);
      btn.on('pointerdown', (function () { ov.destroy(); this.scene.restart(); }).bind(this));
      this.goatJump('meh');
    }
  });

  // ---------- Helfer ----------
  function shapeDims(coords) {
    var mr = 0, mc = 0;
    coords.forEach(function (rc) { mr = Math.max(mr, rc[0]); mc = Math.max(mc, rc[1]); });
    return { h: mr + 1, w: mc + 1 };
  }
  function cheeseBlock(scene, cx, cy, size) {
    // ein Kaese-Block: gerundetes Gold-Rechteck + 2 Loecher
    var g = scene.add.graphics();
    var s = size, x = -s / 2, y = -s / 2;
    g.fillStyle(COL.cheeseEdge, 1); g.fillRoundedRect(x, y + s * 0.08, s, s, Math.max(3, s * 0.16));
    g.fillStyle(COL.cheese, 1);     g.fillRoundedRect(x, y, s, s, Math.max(3, s * 0.16));
    g.fillStyle(COL.cheeseEdge, 0.55);
    g.fillCircle(x + s * 0.32, y + s * 0.38, s * 0.09);
    g.fillCircle(x + s * 0.66, y + s * 0.62, s * 0.07);
    g.x = cx; g.y = cy;
    return g;
  }
  function rgb(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }

  // ---------- Boot ----------
  function boot() {
    var host = document.getElementById('game');
    var W = host.clientWidth, H = host.clientHeight;
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: W, height: H,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f6f7f7',
      scale: { mode: Phaser.Scale.NONE },
      scene: [BlastScene],
      render: { antialias: true, roundPixels: true }
    });
  }
  window.addEventListener('load', boot);
})();
