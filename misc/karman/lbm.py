"""D2Q9 lattice-Boltzmann simulation of the flow past a cylinder (Karman vortex street).
Saves the vorticity field at regular intervals in frames.npy."""
import numpy as np, time
nx, ny = 560, 150
cx, cy, r = nx // 6, ny // 2, ny // 10
u0, Re = 0.09, 160
nu = u0 * 2 * r / Re
omega = 1 / (3 * nu + 0.5)
c = np.array([[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]])
w = np.array([4/9] + [1/9]*4 + [1/36]*4)
opp = [0,3,4,1,2,7,8,5,6]
X, Y = np.meshgrid(np.arange(nx), np.arange(ny), indexing="ij")
solid = (X - cx)**2 + (Y - cy)**2 < r**2

def feq(rho, ux, uy):
    cu = 3 * (c[:,0,None,None]*ux + c[:,1,None,None]*uy)
    return rho * w[:,None,None] * (1 + cu + cu**2/2 - 1.5*(ux**2 + uy**2))

ux = u0 * np.ones((nx, ny)) * (1 + 1e-2*np.sin(2*np.pi*Y/ny))
uy = np.zeros((nx, ny)); rho = np.ones((nx, ny))
f = feq(rho, ux, uy)
nsteps, every, start = 40000, 40, 24000
frames, probe = [], []
t0 = time.time()
for it in range(nsteps):
    # outflow: copy left-moving populations from the neighbour
    f[[3,6,7], -1, :] = f[[3,6,7], -2, :]
    rho = f.sum(0)
    ux = (f * c[:,0,None,None]).sum(0) / rho
    uy = (f * c[:,1,None,None]).sum(0) / rho
    # inflow (Zou-He-like: impose equilibrium at the left boundary)
    ux[0, :] = u0; uy[0, :] = 0
    rho[0, :] = (f[[0,2,4],0,:].sum(0) + 2*f[[3,6,7],0,:].sum(0)) / (1 - u0)
    eq = feq(rho, ux, uy)
    f[[1,5,8], 0, :] = eq[[1,5,8], 0, :]
    fout = f - omega * (f - eq)
    fout[:, solid] = f[opp][:, solid]          # bounce-back
    for i in range(9):
        f[i] = np.roll(np.roll(fout[i], c[i,0], 0), c[i,1], 1)
    if it >= start and it % every == 0:
        vort = (np.roll(uy, -1, 0) - np.roll(uy, 1, 0)) - (np.roll(ux, -1, 1) - np.roll(ux, 1, 1))
        vort[solid] = 0
        frames.append(vort.astype(np.float32))
        probe.append(uy[cx + 3*r, cy])
    if it % 5000 == 0: print(it, time.time() - t0, flush=True)
np.save("frames.npy", np.array(frames)); np.save("probe.npy", np.array(probe))
np.save("solid.npy", solid)
print("done", nu, omega)
