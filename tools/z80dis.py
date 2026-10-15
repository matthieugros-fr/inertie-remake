"""Désassembleur Z80 compact (algorithme x/y/z/p/q de z80.info « Decoding Z80 opcodes »).

Usage : python3 -I tools/z80dis.py fichier.bin adresse_chargement [début fin]
"""
import sys

R = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
RP = ['BC', 'DE', 'HL', 'SP']
RP2 = ['BC', 'DE', 'HL', 'AF']
CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M']
ALU = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP ']
ROT = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL']
IM = ['0', '0/1', '1', '2', '0', '0/1', '1', '2']
BLI = {(4, 0): 'LDI', (4, 1): 'CPI', (4, 2): 'INI', (4, 3): 'OUTI',
       (5, 0): 'LDD', (5, 1): 'CPD', (5, 2): 'IND', (5, 3): 'OUTD',
       (6, 0): 'LDIR', (6, 1): 'CPIR', (6, 2): 'INIR', (6, 3): 'OTIR',
       (7, 0): 'LDDR', (7, 1): 'CPDR', (7, 2): 'INDR', (7, 3): 'OTDR'}


def h8(v):
    return '&%02X' % v


def h16(v):
    return '&%04X' % v


class Dis:
    def __init__(self, mem, base):
        self.mem = mem
        self.base = base

    def byte(self, a):
        i = a - self.base
        return self.mem[i] if 0 <= i < len(self.mem) else 0

    def word(self, a):
        return self.byte(a) | (self.byte(a + 1) << 8)

    def one(self, pc):
        """Retourne (longueur, texte, cibles)."""
        start = pc
        idx = None
        op = self.byte(pc)
        if op in (0xDD, 0xFD):
            idx = 'IX' if op == 0xDD else 'IY'
            pc += 1
            op = self.byte(pc)
            if op in (0xDD, 0xFD, 0xED):
                return 1, 'NOP*', []
        if op == 0xCB:
            if idx:
                d = self.byte(pc + 1)
                d = d - 256 if d > 127 else d
                op2 = self.byte(pc + 2)
                x, y, z = op2 >> 6, (op2 >> 3) & 7, op2 & 7
                m = '(%s%+d)' % (idx, d)
                t = [ROT[y] + ' ' + m, 'BIT %d,%s' % (y, m), 'RES %d,%s' % (y, m), 'SET %d,%s' % (y, m)][x]
                return pc + 3 - start, t, []
            op2 = self.byte(pc + 1)
            x, y, z = op2 >> 6, (op2 >> 3) & 7, op2 & 7
            t = [ROT[y] + ' ' + R[z], 'BIT %d,%s' % (y, R[z]), 'RES %d,%s' % (y, R[z]), 'SET %d,%s' % (y, R[z])][x]
            return pc + 2 - start, t, []
        if op == 0xED:
            op2 = self.byte(pc + 1)
            x, y, z = op2 >> 6, (op2 >> 3) & 7, op2 & 7
            p, q = y >> 1, y & 1
            n = 2
            if x == 1:
                if z == 0:
                    t = 'IN (C)' if y == 6 else 'IN %s,(C)' % R[y]
                elif z == 1:
                    t = 'OUT (C),0' if y == 6 else 'OUT (C),%s' % R[y]
                elif z == 2:
                    t = ('SBC HL,' if q == 0 else 'ADC HL,') + RP[p]
                elif z == 3:
                    nn = self.word(pc + 2)
                    n = 4
                    t = ('LD (%s),%s' % (h16(nn), RP[p])) if q == 0 else ('LD %s,(%s)' % (RP[p], h16(nn)))
                elif z == 4:
                    t = 'NEG'
                elif z == 5:
                    t = 'RETI' if y == 1 else 'RETN'
                elif z == 6:
                    t = 'IM ' + IM[y]
                else:
                    t = ['LD I,A', 'LD R,A', 'LD A,I', 'LD A,R', 'RRD', 'RLD', 'NOP*', 'NOP*'][y]
            elif x == 2 and (y, z) in BLI:
                t = BLI[(y, z)]
            else:
                t = 'NOP* (ED %02X)' % op2
            return pc + n - start, t, []

        x, y, z = op >> 6, (op >> 3) & 7, op & 7
        p, q = y >> 1, y & 1
        targets = []
        hl = idx or 'HL'
        disp_used = False

        def reg(i):
            nonlocal disp_used
            if idx and i == 6:
                disp_used = True
                d = self.byte(pc + 1)
                d = d - 256 if d > 127 else d
                return '(%s%+d)' % (idx, d)
            if idx and i in (4, 5):
                return (idx + 'H') if i == 4 else (idx + 'L')
            return R[i]

        def rp(i):
            return hl if i == 2 else RP[i]

        def rp2(i):
            return hl if i == 2 else RP2[i]

        n = 1
        if x == 0:
            if z == 0:
                if y == 0:
                    t = 'NOP'
                elif y == 1:
                    t = "EX AF,AF'"
                else:
                    d = self.byte(pc + 1)
                    d = d - 256 if d > 127 else d
                    tgt = (pc + 2 + d) & 0xFFFF
                    targets.append(tgt)
                    n = 2
                    t = ['DJNZ ', 'JR ', 'JR NZ,', 'JR Z,', 'JR NC,', 'JR C,'][y - 2] + h16(tgt)
            elif z == 1:
                if q == 0:
                    t = 'LD %s,%s' % (rp(p), h16(self.word(pc + 1)))
                    n = 3
                else:
                    t = 'ADD %s,%s' % (hl, rp(p))
            elif z == 2:
                if q == 0:
                    if p == 0:
                        t = 'LD (BC),A'
                    elif p == 1:
                        t = 'LD (DE),A'
                    elif p == 2:
                        t = 'LD (%s),%s' % (h16(self.word(pc + 1)), hl)
                        n = 3
                    else:
                        t = 'LD (%s),A' % h16(self.word(pc + 1))
                        n = 3
                else:
                    if p == 0:
                        t = 'LD A,(BC)'
                    elif p == 1:
                        t = 'LD A,(DE)'
                    elif p == 2:
                        t = 'LD %s,(%s)' % (hl, h16(self.word(pc + 1)))
                        n = 3
                    else:
                        t = 'LD A,(%s)' % h16(self.word(pc + 1))
                        n = 3
            elif z == 3:
                t = ('INC ' if q == 0 else 'DEC ') + rp(p)
            elif z == 4:
                t = 'INC ' + reg(y)
            elif z == 5:
                t = 'DEC ' + reg(y)
            elif z == 6:
                r = reg(y)
                off = 2 if disp_used else 1
                t = 'LD %s,%s' % (r, h8(self.byte(pc + off)))
                n = off + 1
            else:
                t = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y]
        elif x == 1:
            if z == 6 and y == 6:
                t = 'HALT'
            else:
                # avec IX/IY, un seul des deux opérandes est indexé
                if idx and (y == 6 or z == 6):
                    a = reg(y) if y == 6 else R[y]
                    b = reg(z) if z == 6 else R[z]
                else:
                    a, b = reg(y), reg(z)
                t = 'LD %s,%s' % (a, b)
        elif x == 2:
            t = ALU[y] + reg(z)
        else:
            if z == 0:
                t = 'RET ' + CC[y]
            elif z == 1:
                if q == 0:
                    t = 'POP ' + rp2(p)
                else:
                    t = ['RET', 'EXX', 'JP (%s)' % hl, 'LD SP,%s' % hl][p]
            elif z == 2:
                tgt = self.word(pc + 1)
                targets.append(tgt)
                t = 'JP %s,%s' % (CC[y], h16(tgt))
                n = 3
            elif z == 3:
                if y == 0:
                    tgt = self.word(pc + 1)
                    targets.append(tgt)
                    t = 'JP ' + h16(tgt)
                    n = 3
                elif y == 2:
                    t = 'OUT (%s),A' % h8(self.byte(pc + 1))
                    n = 2
                elif y == 3:
                    t = 'IN A,(%s)' % h8(self.byte(pc + 1))
                    n = 2
                else:
                    t = ['', '', '', '', 'EX (SP),%s' % hl, 'EX DE,HL', 'DI', 'EI'][y]
            elif z == 4:
                tgt = self.word(pc + 1)
                targets.append(tgt)
                t = 'CALL %s,%s' % (CC[y], h16(tgt))
                n = 3
            elif z == 5:
                if q == 0:
                    t = 'PUSH ' + rp2(p)
                else:
                    tgt = self.word(pc + 1)
                    targets.append(tgt)
                    t = 'CALL ' + h16(tgt)
                    n = 3
            elif z == 6:
                t = ALU[y] + h8(self.byte(pc + 1))
                n = 2
            else:
                t = 'RST %s' % h8(y * 8)
        if disp_used and not (x == 0 and z == 6):
            n += 1
        return pc - start + n, t, targets


def main():
    fn = sys.argv[1]
    base = int(sys.argv[2], 16)
    mem = open(fn, 'rb').read()
    d = Dis(mem, base)
    a0 = int(sys.argv[3], 16) if len(sys.argv) > 3 else base
    a1 = int(sys.argv[4], 16) if len(sys.argv) > 4 else base + len(mem)
    pc = a0
    while pc < a1:
        n, t, _ = d.one(pc)
        raw = ' '.join('%02X' % d.byte(pc + k) for k in range(n))
        print('%04X  %-12s %s' % (pc, raw, t))
        pc += n


if __name__ == '__main__':
    main()
