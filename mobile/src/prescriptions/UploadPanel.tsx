import { ErrorNotice } from '../components/ErrorNotice';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { Body, Button, Label, Panel, styles } from '../components/ui';
import type { Prescription, UploadPage } from './types';
import type { PrescriptionApi } from './api';
import { CropControls, type CropMargins } from './CropControls';

export function UploadPanel({
  api,
  memberId,
  onExtract,
  onBusy,
}: {
  api: PrescriptionApi;
  memberId: string;
  onExtract(value: Prescription): void;
  onBusy(value: boolean): void;
}) {
  const [pages, setPages] = useState<UploadPage[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const [mode, setMode] = useState<'mock' | 'openai'>('openai');
  useEffect(() => {
    let cancelled = false;
    api
      .request<{ available: boolean; mode?: 'mock' | 'openai' }>('/prescriptions/options')
      .then((result) => {
        if (!cancelled) {
          setAvailable(result.available);
          setMode(result.mode || 'openai');
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);
  const key = useRef(Crypto.randomUUID());
  const lock = useRef(false);
  const [originals, setOriginals] = useState<UploadPage[]>([]);
  const update = (value: UploadPage[]) => {
    setPages(value);
    setPreviews([]);
    key.current = Crypto.randomUUID();
    setError('');
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not process the selected page.');
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  const add = (incoming: UploadPage[]) => {
    const next = [...pages, ...incoming];
    if (next.length > 8 || next.reduce((sum, page) => sum + (page.size || 0), 0) > 10485760)
      throw new Error('Choose up to 8 pages/files with a combined size up to 10 MB.');
    if (originals.length) setOriginals([...originals, ...incoming]);
    update(next);
  };
  const camera = async (replace?: number) => {
    if (Platform.OS !== 'web' && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
      throw new Error('Camera permission was denied. Use Upload instead.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const page: UploadPage = {
      id: Crypto.randomUUID(),
      uri: asset.uri,
      name: asset.fileName || 'prescription.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
      size: asset.fileSize,
    };
    if (replace === undefined) add([page]);
    else update(pages.map((old, index) => (index === replace ? page : old)));
  };
  const edit = async (index: number, crop?: CropMargins) => {
    if (!originals.length) setOriginals([...pages]);
    const page = pages[index];
    const context = ImageManipulator.manipulate(page.uri);
    if (crop) {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) =>
        Image.getSize(page.uri, (width, height) => resolve({ width, height }), reject),
      );
      context.crop({
        originX: Math.floor((size.width * crop.left) / 100),
        originY: Math.floor((size.height * crop.top) / 100),
        width: Math.max(1, Math.floor((size.width * (100 - crop.left - crop.right)) / 100)),
        height: Math.max(1, Math.floor((size.height * (100 - crop.top - crop.bottom)) / 100)),
      });
    } else context.rotate(90);
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
    update(
      pages.map((old, current) =>
        current === index
          ? {
              ...old,
              uri: result.uri,
              file: undefined,
              name: 'edited-prescription.jpg',
              mimeType: 'image/jpeg',
              size: undefined,
              originalUri: old.originalUri || old.uri,
            }
          : old,
      ),
    );
  };
  return (
    <Panel>
      <Label>Scan or upload prescription</Label>
      {mode !== 'mock' ? (
        <Body>
          Extraction sends the selected prescription to OpenAI and may incur API charges. Previewing
          pages does not call OpenAI.
        </Body>
      ) : null}
      {!available ? (
        <Body>
          Real extraction is not configured on the backend. Add your private API key and enable
          extraction, then reopen this page. Upload preview and manual medicine entry remain
          available.
        </Body>
      ) : null}
      <Button
        secondary
        title="Scan with camera"
        disabled={busy}
        onPress={() => void run(() => camera())}
      />
      <Button
        secondary
        title="Upload PDF or images"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: ['image/jpeg', 'image/png', 'application/pdf'],
              multiple: true,
              copyToCacheDirectory: true,
              base64: false,
            });
            if (!result.canceled)
              add(
                result.assets.map((asset) => ({
                  ...asset,
                  id: Crypto.randomUUID(),
                  mimeType: asset.mimeType || 'application/octet-stream',
                })),
              );
          })
        }
      />
      {pages.map((page, index) => (
        <View key={page.id} style={{ gap: 8 }}>
          <Body>
            File {index + 1}: {page.name}
          </Body>
          {page.mimeType.startsWith('image/') ? (
            <Image
              accessibilityLabel={`Selected prescription image ${index + 1}`}
              source={{ uri: page.uri }}
              style={{ width: '100%', height: 300 }}
              resizeMode="contain"
            />
          ) : (
            <Body>PDF pages appear after selecting Preview all pages.</Body>
          )}
          <View style={styles.row}>
            {index > 0 ? (
              <Button
                compact
                secondary
                disabled={busy}
                title="Move earlier"
                onPress={() => {
                  const next = [...pages];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  update(next);
                }}
              />
            ) : null}
            <Button
              compact
              secondary
              disabled={busy}
              title="Remove file"
              onPress={() => update(pages.filter((_, current) => current !== index))}
            />
            <Button
              compact
              secondary
              disabled={busy}
              title="Retake"
              onPress={() => void run(() => camera(index))}
            />
          </View>
          {page.mimeType.startsWith('image/') ? (
            <View style={styles.row}>
              <Button
                compact
                secondary
                disabled={busy}
                title="Rotate 90°"
                onPress={() => void run(() => edit(index))}
              />
              <CropControls
                disabled={busy}
                onApply={(margins) => void run(() => edit(index, margins))}
              />
              {page.originalUri ? (
                <Button
                  compact
                  secondary
                  disabled={busy}
                  title="Undo image edits"
                  onPress={() =>
                    update(
                      pages.map((old, current) =>
                        current === index
                          ? {
                              ...old,
                              uri: old.originalUri!,
                              originalUri: undefined,
                              file: undefined,
                            }
                          : old,
                      ),
                    )
                  }
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
      {pages.length ? (
        <>
          <Button
            secondary
            title={busy ? 'Processing…' : 'Preview all pages'}
            disabled={busy}
            onPress={() =>
              void run(async () => setPreviews(await api.previewFiles(memberId, pages)))
            }
          />
          {previews.map((uri, index) => (
            <Image
              key={index}
              accessibilityLabel={`Prescription page ${index + 1}`}
              source={{ uri }}
              style={{ width: '100%', height: 350 }}
              resizeMode="contain"
            />
          ))}
          {previews.length && pages.some((page) => page.mimeType === 'application/pdf') ? (
            <Button
              secondary
              title="Edit PDF pages individually"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (!originals.length) setOriginals([...pages]);
                  const images: UploadPage[] = [];
                  for (const [index, uri] of previews.entries()) {
                    const image = await ImageManipulator.manipulate(uri).renderAsync();
                    const saved = await image.saveAsync({
                      format: SaveFormat.JPEG,
                      compress: 0.95,
                    });
                    images.push({
                      id: Crypto.randomUUID(),
                      uri: saved.uri,
                      name: `page-${index + 1}.jpg`,
                      mimeType: 'image/jpeg',
                    });
                  }
                  update(images);
                })
              }
            />
          ) : null}
          {originals.length ? (
            <Body>
              Original files retained in history: {originals.map((file) => file.name).join(', ')}.
              Removing a rendered page excludes it from extraction; its original file is still
              archived. Review this list before sending.
            </Body>
          ) : null}
          <Body>
            Check that every medicine is legible and no section was cropped out before extracting. A
            network retry may incur another charge if the previous result was not saved.
          </Body>
          <Button
            title={
              mode === 'mock'
                ? 'Load mock prescription — no API cost'
                : 'Send to OpenAI and extract all medicines'
            }
            disabled={busy || !previews.length || !available}
            onPress={() =>
              void run(async () => {
                onExtract(await api.extract(memberId, pages, key.current, originals));
                setPages([]);
                setPreviews([]);
                setOriginals([]);
              })
            }
          />
        </>
      ) : null}
      <ErrorNotice message={error} />
    </Panel>
  );
}
