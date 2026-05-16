import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/i18n/t.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Photo Uploader — Multi-photo picker with upload progress
/// ═══════════════════════════════════════════════════════════════════════════
/// Supports camera capture + gallery picker. Max 5 photos.
/// Upload to S3 via pre-signed URL handled by parent screen.
/// ═══════════════════════════════════════════════════════════════════════════
class PhotoUploader extends StatefulWidget {
  final List<XFile> photos;
  final ValueChanged<List<XFile>> onPhotosChanged;
  final int maxPhotos;

  const PhotoUploader({
    super.key,
    required this.photos,
    required this.onPhotosChanged,
    this.maxPhotos = 5,
  });

  @override
  State<PhotoUploader> createState() => _PhotoUploaderState();
}

class _PhotoUploaderState extends State<PhotoUploader> {
  final ImagePicker _picker = ImagePicker();

  Future<void> _pickFromCamera() async {
    if (widget.photos.length >= widget.maxPhotos) {
      _showMaxWarning();
      return;
    }
    try {
      final photo = await _picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );
      if (photo != null) {
        widget.onPhotosChanged([...widget.photos, photo]);
      }
    } catch (e) {
      debugPrint('[PhotoUploader] Camera error: $e');
    }
  }

  Future<void> _pickFromGallery() async {
    final remaining = widget.maxPhotos - widget.photos.length;
    if (remaining <= 0) {
      _showMaxWarning();
      return;
    }
    try {
      final images = await _picker.pickMultiImage(
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );
      if (images.isNotEmpty) {
        final toAdd = images.take(remaining).toList();
        widget.onPhotosChanged([...widget.photos, ...toAdd]);
      }
    } catch (e) {
      debugPrint('[PhotoUploader] Gallery error: $e');
    }
  }

  void _removePhoto(int index) {
    final updated = List<XFile>.from(widget.photos);
    updated.removeAt(index);
    widget.onPhotosChanged(updated);
  }

  void _showMaxWarning() {
    final colors = context.colors;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(context.tr('pu_max_photos').replaceAll('\$1', '${widget.maxPhotos}')),
        backgroundColor: colors.warning,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Action buttons
        Row(
          children: [
            Expanded(
              child: _actionButton(
                icon: PhosphorIconsRegular.camera,
                label: context.tr('pu_camera'),
                onTap: _pickFromCamera,
                colors: colors,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _actionButton(
                icon: PhosphorIconsRegular.images,
                label: context.tr('pu_gallery'),
                onTap: _pickFromGallery,
                colors: colors,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Counter
        Text(
          context.tr('pu_photos_counter').replaceAll('\$1', '${widget.photos.length}').replaceAll('\$2', '${widget.maxPhotos}'),
          style: TextStyle(
            fontSize: 13,
            color: colors.textSecondary,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),

        // Photo grid
        if (widget.photos.isNotEmpty)
          SizedBox(
            height: 110,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: widget.photos.length,
              itemBuilder: (context, index) {
                return _photoThumbnail(index, colors);
              },
            ),
          ),

        // Empty state
        if (widget.photos.isEmpty)
          Container(
            height: 120,
            width: double.infinity,
            decoration: BoxDecoration(
              color: colors.backgroundSecondary,
              borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
              border: Border.all(
                color: colors.strokeSubtle,
                style: BorderStyle.solid,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(PhosphorIconsRegular.cameraPlus, size: 36, color: colors.textSubtle),
                const SizedBox(height: 8),
                Text(
                  context.tr('pu_add_damage_photos'),
                  style: TextStyle(fontSize: 13, color: colors.textSecondary),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    required SemanticColors colors,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: colors.primaryBrand.withAlpha(10),
          borderRadius: BorderRadius.circular(NammerhaTheme.radiusMd),
          border: Border.all(color: colors.primaryBrand.withAlpha(40)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: colors.primaryBrand, size: 20),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: colors.primaryBrand,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _photoThumbnail(int index, SemanticColors colors) {
    return Container(
      width: 100,
      height: 100,
      margin: const EdgeInsetsDirectional.only(end: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.strokeSubtle),
      ),
      child: Stack(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(11),
            child: FutureBuilder<String>(
              future: Future.value(widget.photos[index].path),
              builder: (context, snapshot) {
                if (snapshot.hasData) {
                  return Image.asset(
                    snapshot.data!,
                    width: 100,
                    height: 100,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => Container(
                      color: colors.backgroundSecondary,
                      child: Icon(PhosphorIconsRegular.image, color: colors.textSubtle),
                    ),
                  );
                }
                return Container(color: colors.backgroundSecondary);
              },
            ),
          ),
          // Remove button
          PositionedDirectional(
            top: 4,
            end: 4,
            child: GestureDetector(
              onTap: () => _removePhoto(index),
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: colors.error,
                  shape: BoxShape.circle,
                ),
                child: Icon(PhosphorIconsRegular.x, color: Colors.white, size: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
