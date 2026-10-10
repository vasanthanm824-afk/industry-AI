import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import cv2
import numpy as np
from ml.inference.identifier import FeatureExtractor, WorkerIdentifier

fe = FeatureExtractor(device='cpu')
ident = WorkerIdentifier(device='cpu', confidence_threshold=0.60)

print(f"Gallery size: {len(ident.gallery)}")
for wid, data in ident.gallery.items():
    print(f"  Enrolled [{wid}] name='{data['worker_name']}', embedding_norm={np.linalg.norm(data['embedding']):.4f}")

eval_dir = 'data/eval_workers'
results = []

for cid in sorted(os.listdir(eval_dir)):
    cfolder = os.path.join(eval_dir, cid)
    if not os.path.isdir(cfolder):
        continue
    for f in sorted(os.listdir(cfolder)):
        img_path = os.path.join(cfolder, f)
        img = cv2.imread(img_path)
        q_emb = fe.extract_embedding(img)

        sims = {}
        for wid, data in ident.gallery.items():
            sims[wid] = float(np.dot(q_emb, data['embedding']))

        pred_id, pred_name, pred_conf = ident.identify_crop(img)
        results.append({
            'class': cid,
            'file': f,
            'sims': sims,
            'pred_id': pred_id,
            'pred_name': pred_name,
            'conf': pred_conf
        })

print("\n" + "=" * 80)
print("ENROLLED SAMPLES EVALUATION (12 SAMPLES)")
print("=" * 80)
known_sims_genuine = []
known_sims_cross = []

for r in results:
    if r['class'] != 'UNKNOWN':
        target_wid = r['class']
        genuine_sim = r['sims'].get(target_wid, 0.0)
        cross_sims = [s for wid, s in r['sims'].items() if wid != target_wid]
        known_sims_genuine.append(genuine_sim)
        known_sims_cross.extend(cross_sims)
        sim_str = ", ".join([f"{k}: {v:.4f}" for k, v in r['sims'].items()])
        print(f"[{r['class']}] {r['file']:<15} | Sims: [{sim_str}] | Pred: {r['pred_id']} ({r['pred_name']}) @ {r['conf']:.4f}")

print("\n" + "=" * 80)
print("UNREGISTERED IMPOSTOR SAMPLES EVALUATION (6 SAMPLES)")
print("=" * 80)
impostor_sims = []
for r in results:
    if r['class'] == 'UNKNOWN':
        max_sim = max(r['sims'].values())
        impostor_sims.append(max_sim)
        sim_str = ", ".join([f"{k}: {v:.4f}" for k, v in r['sims'].items()])
        print(f"[{r['class']}] {r['file']:<15} | Sims: [{sim_str}] | Pred: {r['pred_id']} ({r['pred_name']}) @ {r['conf']:.4f}")

print("\n" + "=" * 80)
print("SCORE DISTRIBUTION SUMMARY:")
print("=" * 80)
print(f"Genuine matches (enrolled worker vs self):")
print(f"  Min: {min(known_sims_genuine):.4f} | Max: {max(known_sims_genuine):.4f} | Mean: {np.mean(known_sims_genuine):.4f} | Std: {np.std(known_sims_genuine):.4f}")

print(f"Cross-matches (enrolled worker A vs enrolled worker B):")
print(f"  Min: {min(known_sims_cross):.4f} | Max: {max(known_sims_cross):.4f} | Mean: {np.mean(known_sims_cross):.4f} | Std: {np.std(known_sims_cross):.4f}")

print(f"Impostor matches (stranger vs enrolled gallery):")
print(f"  Min: {min(impostor_sims):.4f} | Max: {max(impostor_sims):.4f} | Mean: {np.mean(impostor_sims):.4f} | Std: {np.std(impostor_sims):.4f}")
